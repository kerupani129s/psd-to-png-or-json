(() => {

	const PSDUtils = (() => {

		const PSD = require('psd');

		const readAsArrayBuffer = blob => new Promise((resolve, reject) => {

			const reader = new FileReader();

			reader.onload = () => resolve(reader.result);
			reader.onerror = e => reject(e);

			reader.readAsArrayBuffer(blob);

		});

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

		return {
			fromFile,
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

		const convertToFlattenedImage = psd => {

			const dataURL = psd.image.toBase64();

			flattenedImage.src = dataURL;
			flattenedImageLink.href = dataURL;

		};

		return convertToFlattenedImage;

	})();

	const getNodeInfo = (() => {

		const ExportedNode = class {

			_node = {};

			_imageURL;
			_imageFileName;

			constructor(node, imageFileName = null) {

				for (const [key, value] of Object.entries(node.export())) {
					if ( ! ['children', 'mask', 'image'].includes(key) ) {
						this._node[key] = value;
					}
				}

				this._node.path = node.path(true);

				this._imageURL = node.isLayer() ? node.layer.image.toBase64() : null;
				this._imageFileName = node.isLayer() ? imageFileName : null;

			}

			get(withDataURL = false) {

				const node = Object.assign({}, this._node);

				if ( this.hasImageURL() ) {
					node.src = withDataURL ? this.getImageURL() : this.getImageFileName();
				}

				return node;

			}

			hasImageURL() {
				return Boolean(this._imageURL);
			}

			getImageURL() {
				return this._imageURL;
			}

			getImageFileName() {
				return this._imageFileName;
			}

		};

		const getNodeInfo = root => {

			// 
			const width = root.width;
			const height = root.height;

			// 
			const images = [];

			const exportedDescendants = root.descendants().map((node, i) => new ExportedNode(node, i + '.png'));

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

		const convertToLayerInfo = (nodeInfo, withDataURL = false) => {

			const width = nodeInfo.width;
			const height = nodeInfo.height;
			const descendants = nodeInfo.exportedDescendants
				.map(exportedNode => exportedNode.get(withDataURL));

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

		const convertToLayerImages = async nodeInfo => {

			const zip = new JSZip();

			const zipFileName = layerImagesLink.download;
			const [, folderName] = zipFileName.match(/^(.+?)(?:\.[^.]+)?$/);

			const folder = zip.folder(folderName);

			// 
			const exportedDescendants = nodeInfo.exportedDescendants
				.filter(exportedNode => exportedNode.hasImageURL());

			for (const exportedNode of exportedDescendants) {

				const name = exportedNode.getImageFileName();
				const url = exportedNode.getImageURL();

				// 
				const [, data] = url.match(/^data:[^,]*;base64(?:;[^,]*)?,(.*)$/) || [];

				if ( ! data ) {
					throw new Error('Invalid image data');
				}

				folder.file(name, data, { base64: true });

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
			console.log(error);
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
				convertToFlattenedImage(psd);
				console.timeEnd("flattened image");

				const root = psd.tree();

				console.time("node info");
				const nodeInfo = getNodeInfo(root);
				console.timeEnd("node info");

				convertToLayerInfo(nodeInfo, false);

				console.time("layer images");
				await convertToLayerImages(nodeInfo);
				console.timeEnd("layer images");

				console.time("layer info and layer images");
				convertToLayerInfo(nodeInfo, true);
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

		// 
		const inputFileElement = document.getElementById('file');

		inputFileElement.addEventListener('change', async event => {

			console.time('all');

			// 
			inputFileElement.disabled = true;

			// 
			const files = event.target.files;

			if ( files.length > 0 ) {

				const file = files[0];

				await convert(file);

			}

			// 
			inputFileElement.disabled = false;

			console.timeEnd('all');

		});

	})();

})();
