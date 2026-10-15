import Foundation
import AppKit
import SwiftTerm

// C-compatible callback types (matching SwiftTermBridge.h)
public typealias SwiftTermInputCallback = @convention(c) (UnsafeMutableRawPointer?, UnsafeRawPointer?, Int) -> Void
public typealias SwiftTermActivityCallback = @convention(c) (UnsafeMutableRawPointer?, Bool) -> Void

// MARK: - Session Management

/// Thread-safe lock protecting the sessions dictionary.
private let sessionLock = NSLock()

/// Active terminal sessions keyed by session ID.
private var sessions: [String: TerminalSession] = [:]

/// Encapsulates a terminal view and its delegate for a single session.
private class TerminalSession {
    let view: TerminalView
    let delegate: BridgeDelegate

    init(view: TerminalView, delegate: BridgeDelegate) {
        self.view = view
        self.delegate = delegate
    }
}

/// Safely retrieves a session by ID, returning nil if not found.
private func getSession(_ sessionId: String) -> TerminalSession? {
    sessionLock.lock()
    defer { sessionLock.unlock() }
    return sessions[sessionId]
}

/// Stores a session under the given ID.
private func setSession(_ sessionId: String, session: TerminalSession) {
    sessionLock.lock()
    defer { sessionLock.unlock() }
    sessions[sessionId] = session
}

/// Removes and returns a session by ID.
@discardableResult
private func removeSession(_ sessionId: String) -> TerminalSession? {
    sessionLock.lock()
    defer { sessionLock.unlock() }
    return sessions.removeValue(forKey: sessionId)
}

// MARK: - Bridge Delegate

/// Delegate that forwards terminal input events to Rust via FFI callbacks.
private class BridgeDelegate: NSObject, TerminalViewDelegate {
    let inputCallback: SwiftTermInputCallback
    let activityCallback: SwiftTermActivityCallback
    let context: UnsafeMutableRawPointer?

    init(
        inputCallback: SwiftTermInputCallback,
        activityCallback: SwiftTermActivityCallback,
        context: UnsafeMutableRawPointer?
    ) {
        self.inputCallback = inputCallback
        self.activityCallback = activityCallback
        self.context = context
        super.init()
    }

    /// Called when the user types in the terminal. Forwards raw bytes to Rust.
    func send(source: TerminalView, data: ArraySlice<UInt8>) {
        let bytes = Array(data)
        bytes.withUnsafeBufferPointer { ptr in
            guard let baseAddress = ptr.baseAddress else { return }
            inputCallback(context, baseAddress, ptr.count)
        }
    }

    func scrolled(source: TerminalView, position: Double) {}

    func setTerminalTitle(source: TerminalView, title: String) {}

    func sizeChanged(source: TerminalView, newCols: Int, newRows: Int) {}

    /// Forwards clipboard copy requests to the system pasteboard.
    func clipboardCopy(source: TerminalView, content: Data) {
        if let str = String(data: content, encoding: .utf8) {
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(str, forType: .string)
        }
    }

    func rangeChanged(source: TerminalView, startY: Int, endY: Int) {}

    func hostCurrentDirectoryUpdate(source: TerminalView, directory: String?) {}
}

// MARK: - Theme Configuration

/// Parses "#rrggbb" or "#rrggbbaa" into 8-bit RGBA components.
private func rgbaFromHex(_ hex: String) -> (UInt64, UInt64, UInt64, UInt64)? {
    var hexSanitized = hex.trimmingCharacters(in: .whitespacesAndNewlines)
    if hexSanitized.hasPrefix("#") {
        hexSanitized.removeFirst()
    }
    if hexSanitized.count == 6 { hexSanitized += "ff" }
    guard hexSanitized.count == 8 else { return nil }
    var v: UInt64 = 0
    guard Scanner(string: hexSanitized).scanHexInt64(&v) else { return nil }
    return ((v >> 24) & 0xFF, (v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF)
}

private func nsColorFromHex(_ hex: String) -> NSColor? {
    guard let (r, g, b, a) = rgbaFromHex(hex) else { return nil }
    return NSColor(
        srgbRed: CGFloat(r) / 255.0, green: CGFloat(g) / 255.0, blue: CGFloat(b) / 255.0,
        alpha: CGFloat(a) / 255.0)
}

private func termColorFromHex(_ hex: String) -> SwiftTerm.Color? {
    guard let (r, g, b, _) = rgbaFromHex(hex) else { return nil }
    // 0...255 to SwiftTerm's 0...65535.
    return SwiftTerm.Color(red: UInt16(r * 257), green: UInt16(g * 257), blue: UInt16(b * 257))
}

/// A palette of the xterm.js panes (`TERMINAL_PALETTES` in @workbench/chat-ui),
/// parsed from comma-separated hex: foreground, background, cursor, selection,
/// then the 16 ANSI colors. Nil for anything else.
private struct Palette {
    let foreground: NSColor
    let background: NSColor
    let cursor: NSColor
    let selection: NSColor
    let ansi: [SwiftTerm.Color]

    init?(_ colors: String) {
        let hex = colors.split(separator: ",").map(String.init)
        guard hex.count == 20,
            let foreground = nsColorFromHex(hex[0]),
            let background = nsColorFromHex(hex[1]),
            let cursor = nsColorFromHex(hex[2]),
            let selection = nsColorFromHex(hex[3])
        else { return nil }
        let ansi = hex[4...].compactMap(termColorFromHex)
        guard ansi.count == 16 else { return nil }
        (self.foreground, self.background, self.cursor, self.selection, self.ansi) =
            (foreground, background, cursor, selection, ansi)
    }

    /// Main thread only.
    func apply(to view: TerminalView) {
        view.nativeForegroundColor = foreground
        view.nativeBackgroundColor = background
        view.caretColor = cursor
        view.selectedTextBackgroundColor = selection
        view.installColors(ansi)
    }
}

// MARK: - FFI Functions

/// Creates a new terminal view and attaches it as a subview of the given NSView.
///
/// - Parameters:
///   - session_id: Unique C string identifier for this terminal session.
///   - parent_ns_view: Opaque pointer to the parent NSView (e.g., window's content view).
///   - x, y, width, height: Frame rectangle in the parent's coordinate system.
///   - font_size: Font size in points.
///   - font_family: C string font family name, or NULL for the system monospaced font.
///   - colors: The palette, in `Palette`'s format; applied before the view is shown.
///   - input_callback: Called when the user types; receives raw bytes.
///   - activity_callback: Called on terminal activity state changes.
///   - callback_context: Opaque pointer passed back to both callbacks.
/// - Returns: `true` on success, `false` on failure.
@_cdecl("swift_term_create")
public func swift_term_create(
    _ session_id: UnsafePointer<CChar>,
    _ parent_ns_view: UnsafeMutableRawPointer,
    _ x: Double, _ y: Double, _ width: Double, _ height: Double,
    _ font_size: Double,
    _ font_family: UnsafePointer<CChar>?,
    _ colors: UnsafePointer<CChar>,
    _ input_callback: SwiftTermInputCallback,
    _ activity_callback: SwiftTermActivityCallback,
    _ callback_context: UnsafeMutableRawPointer?
) -> Bool {
    let sessionId = String(cString: session_id)
    guard let palette = Palette(String(cString: colors)) else { return false }

    // Resolve font: use the specified family if provided, otherwise system monospaced
    let font: NSFont
    if let fontFamilyCStr = font_family {
        let familyName = String(cString: fontFamilyCStr)
        font = NSFont(name: familyName, size: CGFloat(font_size))
            ?? NSFont.monospacedSystemFont(ofSize: CGFloat(font_size), weight: .regular)
    } else {
        font = NSFont.monospacedSystemFont(ofSize: CGFloat(font_size), weight: .regular)
    }

    // All NSView operations must happen on the main thread.
    // Use DispatchQueue.main.sync so we can return a result synchronously.
    var success = false

    let work = {
        let parentView = Unmanaged<NSView>.fromOpaque(parent_ns_view).takeUnretainedValue()
        let frame = NSRect(x: x, y: y, width: width, height: height)

        let terminalView = TerminalView(frame: frame)
        terminalView.font = font
        terminalView.autoresizingMask = []  // We control frame manually
        palette.apply(to: terminalView)

        let delegate = BridgeDelegate(
            inputCallback: input_callback,
            activityCallback: activity_callback,
            context: callback_context
        )
        terminalView.terminalDelegate = delegate

        parentView.addSubview(terminalView)

        let session = TerminalSession(view: terminalView, delegate: delegate)
        setSession(sessionId, session: session)

        success = true
    }

    if Thread.isMainThread {
        work()
    } else {
        DispatchQueue.main.sync { work() }
    }

    return success
}

/// Feeds raw PTY output data to the terminal for rendering.
///
/// This function is safe to call from any thread. The data is dispatched
/// to the main thread for rendering.
///
/// - Parameters:
///   - session_id: C string session identifier.
///   - data: Pointer to the raw byte data.
///   - len: Number of bytes to feed.
@_cdecl("swift_term_feed")
public func swift_term_feed(
    _ session_id: UnsafePointer<CChar>,
    _ data: UnsafeRawPointer,
    _ len: Int
) {
    let sessionId = String(cString: session_id)

    // Copy the data immediately since the pointer may be invalidated after this call returns
    let byteArray = Array(UnsafeBufferPointer(
        start: data.assumingMemoryBound(to: UInt8.self),
        count: len
    ))

    DispatchQueue.main.async {
        guard let session = getSession(sessionId) else { return }
        session.view.feed(byteArray: byteArray[...])
    }
}

/// Updates the terminal view's frame position and size.
///
/// Must result in main-thread work since it modifies an NSView.
///
/// - Parameters:
///   - session_id: C string session identifier.
///   - x, y, width, height: New frame rectangle.
@_cdecl("swift_term_resize")
public func swift_term_resize(
    _ session_id: UnsafePointer<CChar>,
    _ x: Double, _ y: Double, _ width: Double, _ height: Double
) {
    let sessionId = String(cString: session_id)
    let newFrame = NSRect(x: x, y: y, width: width, height: height)

    let work = {
        guard let session = getSession(sessionId) else { return }
        session.view.frame = newFrame
    }

    if Thread.isMainThread {
        work()
    } else {
        DispatchQueue.main.sync { work() }
    }
}

/// Reads the current terminal dimensions in character cells.
///
/// Writes the column and row counts to the provided output pointers.
/// If the session does not exist, writes 0 to both.
///
/// - Parameters:
///   - session_id: C string session identifier.
///   - out_cols: Pointer to receive the column count.
///   - out_rows: Pointer to receive the row count.
@_cdecl("swift_term_get_size")
public func swift_term_get_size(
    _ session_id: UnsafePointer<CChar>,
    _ out_cols: UnsafeMutablePointer<UInt16>,
    _ out_rows: UnsafeMutablePointer<UInt16>
) {
    let sessionId = String(cString: session_id)

    guard let session = getSession(sessionId) else {
        out_cols.pointee = 0
        out_rows.pointee = 0
        return
    }

    let terminal = session.view.getTerminal()
    out_cols.pointee = UInt16(terminal.cols)
    out_rows.pointee = UInt16(terminal.rows)
}

/// Shows or hides the terminal view.
///
/// - Parameters:
///   - session_id: C string session identifier.
///   - visible: `true` to show, `false` to hide.
@_cdecl("swift_term_set_visible")
public func swift_term_set_visible(
    _ session_id: UnsafePointer<CChar>,
    _ visible: Bool
) {
    let sessionId = String(cString: session_id)

    let work = {
        guard let session = getSession(sessionId) else { return }
        session.view.isHidden = !visible
    }

    if Thread.isMainThread {
        work()
    } else {
        DispatchQueue.main.async { work() }
    }
}

/// Repaints a view in another palette (`Palette`'s format). Returns false,
/// changing nothing, for a malformed one.
@_cdecl("swift_term_set_colors")
public func swift_term_set_colors(
    _ session_id: UnsafePointer<CChar>,
    _ colors: UnsafePointer<CChar>
) -> Bool {
    let sessionId = String(cString: session_id)
    guard let palette = Palette(String(cString: colors)) else { return false }

    let work = {
        guard let session = getSession(sessionId) else { return }
        palette.apply(to: session.view)
    }

    if Thread.isMainThread {
        work()
    } else {
        DispatchQueue.main.async { work() }
    }
    return true
}

/// Writes text to the terminal as if the user typed it.
///
/// This is intended for programmatic input such as startup commands
/// injected from the Rust side. The text is forwarded through the
/// input callback so the PTY receives it.
///
/// - Parameters:
///   - session_id: C string session identifier.
///   - text: C string to send as input.
@_cdecl("swift_term_write")
public func swift_term_write(
    _ session_id: UnsafePointer<CChar>,
    _ text: UnsafePointer<CChar>
) {
    let sessionId = String(cString: session_id)
    let string = String(cString: text)

    guard let session = getSession(sessionId) else { return }

    // Convert the string to bytes and forward through the input callback
    // so the PTY receives the data the same way as user keystrokes.
    let bytes = Array(string.utf8)
    bytes.withUnsafeBufferPointer { ptr in
        guard let baseAddress = ptr.baseAddress else { return }
        session.delegate.inputCallback(
            session.delegate.context,
            baseAddress,
            ptr.count
        )
    }
}

/// Destroys a terminal session, removing its view from the view hierarchy
/// and releasing all associated resources.
///
/// - Parameter session_id: C string session identifier.
@_cdecl("swift_term_destroy")
public func swift_term_destroy(
    _ session_id: UnsafePointer<CChar>
) {
    let sessionId = String(cString: session_id)

    guard let session = removeSession(sessionId) else { return }

    let work = {
        session.view.removeFromSuperview()
    }

    // Synchronous: once this returns no callback can still be running or come
    // later (they only fire on the main thread, from a view in the hierarchy),
    // so the caller may free the callback context.
    if Thread.isMainThread {
        work()
    } else {
        DispatchQueue.main.sync { work() }
    }
}
