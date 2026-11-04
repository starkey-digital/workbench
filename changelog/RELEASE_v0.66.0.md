# Release v0.66.0

**Released:** 2026-11-04
**Previous version:** v0.65.0

You can now start a project on a remote server without leaving Workbench. Add one of its folders, make a new folder, or clone a repository straight onto that machine.

## New Features

- Added **+ Project** to a remote server's sidebar. It opens that machine's folders, starting in the server's copy folder, and from the folder you're in you can:
  - add the folder as a project
  - make a new folder there, as a git repository if you like, and add it in one step
  - clone a repository into it, from the server's own GitHub repo list or by URL or `owner/repo`

  (#342)

## Improvements

- Private GitHub repositories now clone with the machine's `gh` login, both on remote servers and in the local **Clone from GitHub** dialog, without running `gh auth setup-git` first (#342)
- A clone or new folder that fails part-way is removed, so trying again with the same name works (#342)
