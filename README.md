# Green Lantern Loader Test

Interactive Three.js charging-loader prototype using two GLB models.

## Files

- `index.html`
- `style.css`
- `script.js`
- `assets/green_lantern.glb`
- `assets/green-lantern-ring.glb`

## Run locally

Because the page loads 3D assets, use a local server rather than opening `index.html` directly.

### VS Code + Live Server

1. Open this folder in VS Code.
2. Install the **Live Server** extension.
3. Right-click `index.html`.
4. Choose **Open with Live Server**.

## Interaction

1. Move your mouse toward the battery.
2. The 3D ring is magnetically attracted toward the charging point.
3. When it snaps into place, press and hold the mouse button.
4. The charge rises and the oath reveals progressively.
5. Releasing early causes the charge to drain.
6. At 100%, the completion transition plays.

## GitHub Pages

This project is static and can be published directly with GitHub Pages from the repository root.


## GitHub upload note
Both 3D model files are now under GitHub's 25 MB browser-upload limit. The larger battery was converted from STL to GLB, reducing it from about 31.8 MB to about 11.5 MB without changing the visible geometry.
