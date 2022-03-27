(() => {

	const ObjectURL = (() => {

		const set = new Set();

		const create = obj => {
			const objURL = URL.createObjectURL(obj);
			set.add(objURL);
			return objURL;
		};

		const revoke = objURL => {
			URL.revokeObjectURL(objURL);
			set.delete(objURL);
		};

		const clear = () => {
			for (const objURL of set) {
				revoke(objURL);
			}
		};

		return {
			create,
			revoke,
			clear,
		};

	})();

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
				return ObjectURL.create(this._blob);
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

	const convertToFlattenedImage = (() => {

		const flattenedImage = document.getElementById('flattened-image');
		const flattenedImageLink = document.getElementById('flattened-image-link');

		const convertToFlattenedImage = async (psd, name) => {

			const psdImageData = await PSDUtils.toPSDImageData(psd.image);
			const url = await psdImageData.getAsURL();

			await new Promise((resolve, reject) => {
				flattenedImage.onload = () => resolve();
				flattenedImage.onerror = e => reject(e);

				flattenedImage.alt = name;
				flattenedImage.src = url;
			});

			flattenedImageLink.download = name + '.png';
			flattenedImageLink.href = url;

		};

		return convertToFlattenedImage;

	})();

	const getPSDInfo = (() => {

		const ExportedNode = class {

			_node = {};

			_hasImageData;
			_psdImageData;

			_imageFileName;

			constructor(node, parentNodeIndex, psdImageData = null, imageFileName = null) {

				for (const [key, value] of Object.entries(node.export())) {
					if ( ! ['children', 'mask', 'image'].includes(key) ) {
						this._node[key] = value;
					}
				}

				this._node.parentNodeIndex = parentNodeIndex;

				this._hasImageData = Boolean(psdImageData);
				this._psdImageData = psdImageData;

				this._imageFileName = this.hasImageData() ? imageFileName : null;

			}

			static async from(node, parentNodeIndex, imageFileName = null) {

				if ( node.isLayer() ) {

					const psdImageData = await PSDUtils.toPSDImageData(node.layer.image);

					return new ExportedNode(node, parentNodeIndex, psdImageData, imageFileName);

				} else {
					return new ExportedNode(node, parentNodeIndex);
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

		const getPSDInfo = async (psd, name) => {

			const root = psd.tree();

			// 
			const width = root.width;
			const height = root.height;

			// 
			const images = [];

			const descendants = root.descendants();
			const descendantIndices = new Map(descendants.map((node, i) => [node, i]));
			const parentNodeIndices = descendants.map(node => descendantIndices.get(node.parent) ?? null);

			const exportedDescendantPromises = descendants.map((node, i) => ExportedNode.from(
				node, parentNodeIndices[i], i + '.png'
			));
			const exportedDescendants = await Promise.all(exportedDescendantPromises);

			return {
				name,
				width,
				height,
				exportedDescendants,
			};

		};

		return getPSDInfo;

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

		const convertToLayerInfo = async (psdInfo, withDataURL = false) => {

			const width = psdInfo.width;
			const height = psdInfo.height;
			const descendantPromises = psdInfo.exportedDescendants
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
			const fileName = psdInfo.name + (withDataURL ? '.json' : '-info.json');

			a.download = fileName;
			a.href = ObjectURL.create(jsonBlob);

		};

		return convertToLayerInfo;

	})();

	const convertToLayerImages = (() => {

		const layerImagesLink = document.getElementById('layer-images-link');

		const convertToLayerImages = async psdInfo => {

			const zip = new JSZip();

			const folder = zip.folder(psdInfo.name);

			// 
			const exportedDescendants = psdInfo.exportedDescendants
				.filter(exportedNode => exportedNode.hasImageData());

			for (const exportedNode of exportedDescendants) {

				const name = exportedNode.getImageFileName();

				const psdImageData = exportedNode.getPSDImageData();

				if ( psdImageData.isDataURL() ) {

					const url = psdImageData.get();

					// 
					const [, data] = url.match(/^data:[^,]*;base64,(.*)$/) || [];

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
			layerImagesLink.download = psdInfo.name + '-layers.zip';
			layerImagesLink.href = ObjectURL.create(zipBlob);

		};

		return convertToLayerImages;

	})();

	const convert = (() => {

		const converting = document.getElementById('converting');

		const result = document.getElementById('result');
		const resultError = document.getElementById('result-error');
		const resultOk = document.getElementById('result-ok');

		const flattenedImageResult = document.getElementById('flattened-image-result');
		const layerInfoAndLayerImagesSeparatedResult = document.getElementById('layer-info-and-layer-images-separated-result');
		const layerInfoAndLayerImagesCombinedResult = document.getElementById('layer-info-and-layer-images-combined-result');

		// 
		const showElement = element => {
			element.classList.add('displayed');
		};

		const hideElement = element => {
			element.classList.remove('displayed');
		};

		/**
		 * ブラウザの画面を再描画する
		 * 
		 * メモ: DOM 変更による画面更新を確実にするために必要
		 */
		const repaint = async () => {
			for (let i = 0; i < 2; i++) {
				await new Promise(resolve => requestAnimationFrame(resolve));
			}
		};

		// 
		const initElements = () => {

			hideElement(resultError);
			showElement(resultOk);
			showElement(result);

			showElement(converting);

			hideElement(flattenedImageResult);
			hideElement(layerInfoAndLayerImagesSeparatedResult);
			hideElement(layerInfoAndLayerImagesCombinedResult);

		};

		const getImageName = filename => {
			const [, name] = filename.match(/^(.+?)(?:\.[^.]+)?$/);
			return name;
		};

		const renderError = error => {
			console.error(error);
		};

		const convert = async file => {

			initElements();

			ObjectURL.clear();

			try {

				const psd = await PSDUtils.fromFile(file);
				const name = getImageName(file.name);

				// 
				console.time("flattened image");
				await convertToFlattenedImage(psd, name);
				console.timeEnd("flattened image");

				showElement(flattenedImageResult);

				await repaint();

				// 
				console.time("PSD info");
				const psdInfo = await getPSDInfo(psd, name);
				console.timeEnd("PSD info");

				// 
				console.time("layer info and layer images");
				await convertToLayerInfo(psdInfo, true);
				console.timeEnd("layer info and layer images");

				showElement(layerInfoAndLayerImagesCombinedResult);

				await repaint();

				// 
				await convertToLayerInfo(psdInfo, false);

				console.time("layer images");
				await convertToLayerImages(psdInfo);
				console.timeEnd("layer images");

				showElement(layerInfoAndLayerImagesSeparatedResult);

			} catch (error) {
				hideElement(resultOk);
				renderError(error);
				showElement(resultError);
			}

			hideElement(converting);

		};

		return convert;

	})();

	(() => {

		const inputFileElement = document.getElementById('file');

		const convertOnEvent = async file => {

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
			convertOnEvent(files[0]);
		});

		inputFileElement.disabled = false;

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
			convertOnEvent(files[0]);
		});

	})();

})();
