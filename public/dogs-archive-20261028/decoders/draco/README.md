# Local Draco decoder

Unmodified glTF decoder builds copied from the installed three.js 0.186.1 distribution. They are served from this origin; no external decoder CDN is used.

The WASM wrapper and binary are preferred. The JS decoder is the automatic fallback when WebAssembly is unavailable. The viewer limits decoding to one worker and releases it after parse/abort.

Upstream: https://github.com/google/draco
Distribution: https://github.com/mrdoob/three.js/tree/r186/examples/jsm/libs/draco/gltf
Draco license: LICENSE-APACHE-2.0.txt (upstream Google Draco LICENSE)
three.js distribution license: LICENSE-three-MIT.txt

Exact copied files and SHA-256 values: asset-manifest.json.
