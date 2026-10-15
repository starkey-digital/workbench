<script lang="ts">
	import {
		CHAT_FONT_SIZES,
		CHAT_FONTS,
		fontPrefs,
		TERMINAL_FONT_SIZES,
		TERMINAL_FONTS,
		THEME_CHOICES,
		themePrefs,
		type FontChoice,
		type ThemeChoice
	} from '@workbench/chat-ui';
	import SettingsSection from './SettingsSection.svelte';
	import SettingsSelect from './SettingsSelect.svelte';

	const fontOptions = (fonts: readonly FontChoice[]) =>
		fonts.map((f) => ({ value: f.id, label: f.label }));
	const sizeOptions = (sizes: readonly number[]) =>
		sizes.map((s) => ({ value: String(s), label: `${s}px` }));
</script>

<SettingsSection title="Theme">
	<SettingsSelect
		label="Theme"
		description="System follows the light or dark setting of the OS."
		options={THEME_CHOICES.map((c) => ({ value: c.id, label: c.label }))}
		value={themePrefs.choice}
		onValueChange={(v) => themePrefs.set(v as ThemeChoice)}
	/>
</SettingsSection>

<SettingsSection title="Terminal">
	<SettingsSelect
		label="Font"
		description="System uses JetBrains Mono or Cascadia Mono when installed. Native terminals keep Menlo."
		options={fontOptions(TERMINAL_FONTS)}
		value={fontPrefs.value.terminalFont}
		onValueChange={(v) => fontPrefs.set({ terminalFont: v })}
	/>
	<SettingsSelect
		label="Size"
		description="Native terminals pick up a new size when they reopen."
		options={sizeOptions(TERMINAL_FONT_SIZES)}
		value={String(fontPrefs.value.terminalSize)}
		onValueChange={(v) => fontPrefs.set({ terminalSize: Number(v) })}
	/>
</SettingsSection>

<SettingsSection title="Chat">
	<SettingsSelect
		label="Font"
		description="Message text and the composer."
		options={fontOptions(CHAT_FONTS)}
		value={fontPrefs.value.chatFont}
		onValueChange={(v) => fontPrefs.set({ chatFont: v })}
	/>
	<SettingsSelect
		label="Size"
		options={sizeOptions(CHAT_FONT_SIZES)}
		value={String(fontPrefs.value.chatSize)}
		onValueChange={(v) => fontPrefs.set({ chatSize: Number(v) })}
	/>
</SettingsSection>
