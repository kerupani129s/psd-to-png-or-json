(() => {

	const PSDUtils = (() => {

		const readAsArrayBuffer = blob => new Promise((resolve, reject) => {

			const reader = new FileReader();

			reader.onload = () => resolve(reader.result);
			reader.onerror = e => reject(e);

			reader.readAsArrayBuffer(blob);

		});

		const readAsDataURL = blob => new Promise((resolve, reject) => {

			const reader = new FileReader();

			reader.onload = () => resolve(reader.result);
			reader.onerror = e => reject(e);

			reader.readAsDataURL(blob);

		});

		// 
		const PSD = require('psd');

		// Issue: https://github.com/meltingice/psd.js/issues/197
		// const fromFile = file => PSD.fromDroppedFile(file);

		const fromFile = async file => {

			const arrayBuffer = await readAsArrayBuffer(file);
			// or
			// const arrayBuffer = await file.arrayBuffer();

			const data = new Uint8Array(arrayBuffer);

			const psd = new PSD(data);
			psd.parse();

			return psd;

		};

		const toBlob = psdImage => {

			const width = psdImage.width();
			const height = psdImage.height();

			// 
			const canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;

			const context = canvas.getContext('2d');
			const imageData = context.getImageData(0, 0, width, height);
			const pixelData = imageData.data;

			pixelData.set(psdImage.pixelData);

			context.putImageData(imageData, 0, 0);

			return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));

		};

		const PSDImageData = class {
			isDataURL() {
				return false;
			}
			get() {}
			getAsURL() {}
			getAsDataURL() {}
		};

		const PSDImageDataAsBlob = class extends PSDImageData {

			_blob;

			constructor(blob) {
				super();
				this._blob = blob;
			}

			static async from(psdImage) {
				const blob = await toBlob(psdImage);
				const psdImageData = new PSDImageDataAsBlob(blob);
				return psdImageData;
			}

			get() {
				return this._blob;
			}

			getAsURL() {
				return URL.createObjectURL(this._blob);
			}

			getAsDataURL() {
				return readAsDataURL(this._blob);
			}

		};

		const PSDImageDataAsDataURL = class extends PSDImageData {

			_dataURL;

			constructor(dataURL) {
				super();
				this._dataURL = dataURL;
			}

			static from(psdImage) {
				const dataURL = psdImage.toBase64();
				const psdImageData = new PSDImageDataAsDataURL(dataURL);
				return Promise.resolve(psdImageData);
			}

			isDataURL() {
				return true;
			}

			get() {
				return this._dataURL;
			}

			getAsURL() {
				return this._dataURL;
			}

			getAsDataURL() {
				return Promise.resolve(this._dataURL);
			}

		};

		const useCanvasToDataURL = ! HTMLCanvasElement.prototype.toBlob;

		const toPSDImageData = psdImage => {
			if ( ! useCanvasToDataURL ) {
				return PSDImageDataAsBlob.from(psdImage);
			} else {
				return PSDImageDataAsDataURL.from(psdImage);
			}
		};

		return {
			fromFile,
			toPSDImageData,
		};

	})();

	const renderImageName = (() => {

		const flattenedImage = document.getElementById('flattened-image');

		const flattenedImageLink = document.getElementById('flattened-image-link');
		const layerInfoLink = document.getElementById('layer-info-link');
		const layerImagesLink = document.getElementById('layer-images-link');
		const layerInfoAndLayerImagesLink = document.getElementById('layer-info-and-layer-images-link');

		const renderImageName = name => {

			flattenedImage.alt = name;

			flattenedImageLink.download = name + '.png';
			layerInfoLink.download = name + '-info.json';
			layerImagesLink.download = name + '-layers.zip';
			layerInfoAndLayerImagesLink.download = name + '.json';

		};

		return renderImageName;

	})();

	const convertToFlattenedImage = (() => {

		const flattenedImage = document.getElementById('flattened-image');
		const flattenedImageLink = document.getElementById('flattened-image-link');

		const convertToFlattenedImage = async psd => {

			const psdImageData = await PSDUtils.toPSDImageData(psd.image);
			const url = await psdImageData.getAsURL();

			flattenedImage.src = url;
			flattenedImageLink.href = url;

		};

		return convertToFlattenedImage;

	})();

	const getNodeInfo = (() => {

		const ExportedNode = class {

			_node = {};

			_hasImageData;
			_psdImageData;

			_imageFileName;

			constructor(node, psdImageData = null, imageFileName = null) {

				for (const [key, value] of Object.entries(node.export())) {
					if ( ! ['children', 'mask', 'image'].includes(key) ) {
						this._node[key] = value;
					}
				}

				this._node.path = node.path(true);

				this._hasImageData = Boolean(psdImageData);
				this._psdImageData = psdImageData;

				this._imageFileName = this.hasImageData() ? imageFileName : null;

			}

			static async from(node, imageFileName = null) {

				if ( node.isLayer() ) {

					const psdImageData = await PSDUtils.toPSDImageData(node.layer.image);

					return new ExportedNode(node, psdImageData, imageFileName);

				} else {
					return new ExportedNode(node);
				}

			}

			async get(withDataURL = false) {

				const node = Object.assign({}, this._node);

				if ( this.hasImageData() ) {
					if ( withDataURL ) {
						const psdImageData = this.getPSDImageData();
						node.src = await psdImageData.getAsDataURL();
					} else {
						node.src = this.getImageFileName();
					}
				}

				return node;

			}

			hasImageData() {
				return this._hasImageData;
			}

			getPSDImageData() {
				return this._psdImageData;
			}

			getImageFileName() {
				return this._imageFileName;
			}

		};

		const getNodeInfo = async root => {

			// 
			const width = root.width;
			const height = root.height;

			// 
			const images = [];

			const descendants = root.descendants();
			const exportedDescendantPromises = descendants.map((node, i) => ExportedNode.from(node, i + '.png'));
			const exportedDescendants = await Promise.all(exportedDescendantPromises);

			return {
				width,
				height,
				exportedDescendants,
			};

		};

		return getNodeInfo;

	})();

	const convertToLayerInfo = (() => {

		const toJSONBlob = obj => {

			const json = JSON.stringify(obj, null, 4);
			const blob = new Blob([json], { type: 'application/json' });

			return blob;

		};

		// 
		const layerInfoLink = document.getElementById('layer-info-link');
		const layerInfoAndLayerImagesLink = document.getElementById('layer-info-and-layer-images-link');

		const convertToLayerInfo = async (nodeInfo, withDataURL = false) => {

			const width = nodeInfo.width;
			const height = nodeInfo.height;
			const descendantPromises = nodeInfo.exportedDescendants
				.map(exportedNode => exportedNode.get(withDataURL));
			const descendants = await Promise.all(descendantPromises);

			const layerInfo = {
				width,
				height,
				descendants,
			};

			const jsonBlob = toJSONBlob(layerInfo);

			// 
			const a = withDataURL ? layerInfoAndLayerImagesLink : layerInfoLink;

			a.href = URL.createObjectURL(jsonBlob);

		};

		return convertToLayerInfo;

	})();

	const convertToLayerImages = (() => {

		const layerImagesLink = document.getElementById('layer-images-link');

		const convertToLayerImages = async (nodeInfo, name) => {

			const zip = new JSZip();

			const folder = zip.folder(name);

			// 
			const exportedDescendants = nodeInfo.exportedDescendants
				.filter(exportedNode => exportedNode.hasImageData());

			for (const exportedNode of exportedDescendants) {

				const name = exportedNode.getImageFileName();

				const psdImageData = exportedNode.getPSDImageData();

				if ( psdImageData.isDataURL() ) {

					const url = psdImageData.get();

					// 
					const [, data] = url.match(/^data:[^,]*;base64(?:;[^,]*)?,(.*)$/) || [];

					if ( ! data ) {
						throw new Error('Invalid image data');
					}

					// 
					folder.file(name, data, { base64: true });

				} else {
					const data = psdImageData.get();
					folder.file(name, data);
				}

			}

			const zipBlob = await zip.generateAsync({ type: 'blob' });

			// 
			layerImagesLink.href = URL.createObjectURL(zipBlob);

		};

		return convertToLayerImages;

	})();

	const convert = (() => {

		const converting = document.getElementById('converting');
		const errorResult = document.getElementById('error-result');
		const result = document.getElementById('result');

		const showConverting = () => {

			errorResult.classList.remove('displayed');
			result.classList.remove('displayed');

			converting.classList.add('displayed');

		};

		const getImageName = filename => {
			const [, name] = filename.match(/^(.+?)(?:\.[^.]+)?$/);
			return name;
		};

		const renderError = error => {
			console.error(error);
		};

		const showError = () => {
			errorResult.classList.add('displayed');
		};

		const hideConverting = () => {
			converting.classList.remove('displayed');
		};

		const convert = async file => {

			showConverting();

			try {

				// 
				const name = getImageName(file.name);

				renderImageName(name);

				// 
				const psd = await PSDUtils.fromFile(file);

				console.time("flattened image");
				await convertToFlattenedImage(psd);
				console.timeEnd("flattened image");

				const root = psd.tree();

				console.time("node info");
				const nodeInfo = await getNodeInfo(root);
				console.timeEnd("node info");

				await convertToLayerInfo(nodeInfo, false);

				console.time("layer images");
				await convertToLayerImages(nodeInfo, name);
				console.timeEnd("layer images");

				console.time("layer info and layer images");
				await convertToLayerInfo(nodeInfo, true);
				console.timeEnd("layer info and layer images");

				result.classList.add('displayed');

			} catch (error) {
				renderError(error);
				showError();
			}

			hideConverting();

		};

		return convert;

	})();

	(() => {

		const inputFileElement = document.getElementById('file');

		const converOnEvent = async file => {

			console.time('all');

			inputFileElement.disabled = true;

			await convert(file);

			inputFileElement.disabled = false;

			console.timeEnd('all');

		};

		// 
		inputFileElement.addEventListener('click', () => {
			inputFileElement.value = '';
		});

		inputFileElement.addEventListener('change', event => {
			const files = event.target.files;
			if ( files.length !== 1 ) return;
			converOnEvent(files[0]);
		});

		// 
		const body = document.body;

		body.addEventListener('dragover', event => {
			event.preventDefault();
		});

		body.addEventListener('drop', event => {
			event.preventDefault();
			const files = event.dataTransfer.files;
			if ( files.length !== 1 ) return;
			inputFileElement.files = files;
			converOnEvent(files[0]);
		});

	})();

})();
