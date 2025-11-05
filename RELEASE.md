# Release Process

This document describes how to create and publish new releases of Layrr.

## Automatic Releases via GitHub Actions

Layrr uses GitHub Actions to automatically build and release binaries for macOS (both Intel and Apple Silicon).

### Creating a New Release

#### Option 1: Tag-based Release (Recommended)

1. **Commit all changes** to the main branch

2. **Create and push a version tag:**
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

3. **GitHub Actions will automatically:**
   - Build binaries for macOS Intel (amd64) and Apple Silicon (arm64)
   - Generate SHA256 checksums
   - Create a GitHub Release with all artifacts
   - Generate release notes from commits

4. **The release will be available at:**
   ```
   https://github.com/thetronjohnson/layrr/releases/latest
   ```

#### Option 2: Manual Trigger

1. Go to **Actions** tab on GitHub
2. Select **Release** workflow
3. Click **Run workflow**
4. Enter the version (e.g., `v1.0.1`)
5. Click **Run workflow**

### Version Naming

Follow [Semantic Versioning](https://semver.org/):
- `v1.0.0` - Major release (breaking changes)
- `v1.1.0` - Minor release (new features, backward compatible)
- `v1.0.1` - Patch release (bug fixes)

Always prefix versions with `v` (e.g., `v1.0.0`, not `1.0.0`).

### What Gets Built

The workflow builds:
- `layrr-darwin-amd64` - macOS Intel (x86_64)
- `layrr-darwin-arm64` - macOS Apple Silicon (ARM64)
- SHA256 checksums for both binaries

### Installation Script

The `install.sh` script automatically:
1. Detects the user's architecture (Intel vs Apple Silicon)
2. Fetches the latest release version from GitHub API
3. Downloads the appropriate binary
4. Installs to `/usr/local/bin/layrr`

Users install with:
```bash
curl -fsSL https://layrr.dev/install.sh | bash
```

## Hosting the Install Script

To enable the `curl` installation command:

### Option 1: GitHub Pages

1. **Create a `gh-pages` branch:**
   ```bash
   git checkout --orphan gh-pages
   git rm -rf .
   cp install.sh ./install.sh
   echo "layrr.dev" > CNAME
   git add install.sh CNAME
   git commit -m "Add install script"
   git push origin gh-pages
   ```

2. **Configure DNS:**
   - Add CNAME record: `layrr.dev` → `thetronjohnson.github.io`
   - Or A records pointing to GitHub's IPs

3. **Enable GitHub Pages:**
   - Go to Settings → Pages
   - Select `gh-pages` branch
   - Custom domain: `layrr.dev`

### Option 2: Cloudflare Pages

1. **Create a new Pages project:**
   - Connect to your GitHub repo
   - Build command: (none)
   - Build output directory: `/`
   - Add `install.sh` to root

2. **Configure custom domain:**
   - Add `layrr.dev` in Pages settings
   - DNS automatically configured

### Option 3: Simple Static Hosting

Host `install.sh` on any static file server:
- Vercel
- Netlify
- AWS S3 + CloudFront
- Any web server with HTTPS

Ensure:
- HTTPS is enabled
- Correct MIME type: `text/plain` or `application/x-sh`
- CORS headers if needed

## Pre-Release Checklist

Before creating a new release:

- [ ] All tests pass
- [ ] Update README.md if needed
- [ ] Update version in any relevant files
- [ ] Test install script locally (if modified)
- [ ] Review git log for release notes
- [ ] Commit and push all changes

## Testing a Release

After creating a release, test the installation:

```bash
# Test the install script
curl -fsSL https://layrr.dev/install.sh | bash

# Verify installation
layrr --help

# Test basic functionality
cd ~/your-project
layrr
```

## Troubleshooting

### Release workflow fails

Check:
- Go version compatibility (requires Go 1.21+)
- Build errors in Actions logs
- GitHub token permissions (needs `contents: write`)

### Install script fails to download

Check:
- Release exists and is published (not draft)
- Binary names match: `layrr-darwin-amd64` and `layrr-darwin-arm64`
- GitHub API rate limits (60 requests/hour for unauthenticated)

### Binary won't run on user's machine

Check:
- macOS version compatibility
- Code signing (may require manual approval in System Preferences)
- Architecture mismatch (ensure correct binary downloaded)

## Manual Build (Fallback)

If users can't use the install script:

```bash
git clone https://github.com/thetronjohnson/layrr.git
cd layrr
make install
```

This builds from source and requires:
- Go 1.21+
- Make
