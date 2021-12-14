(() => {

	const PSD = require('psd');

	// 
	const converting = document.getElementById('converting');
	const errorResult = document.getElementById('error-result');
	const result = document.getElementById('result');

	const flattenedImage = document.getElementById('flattened-image');
	const flattenedImageLink = document.getElementById('flattened-image-link');
	const layerInfoLink = document.getElementById('layer-info-link');
	const layerImagesLink = document.getElementById('layer-images-link');
	const layerInfoAndLayerImagesLink = document.getElementById('layer-info-and-layer-images-link');

	// 
	const readAsArrayBuffer = blob => new Promise((resolve, reject) => {

		const reader = new FileReader();

		reader.onload = () => resolve(reader.result);
		reader.onerror = e => reject(e);

		reader.readAsArrayBuffer(blob);

	});

	// 
	const setImageFilename = filename => {

		const [, name] = filename.match(/^(.+?)(?:\.[^.]+)?$/);

		for (const a of [flattenedImageLink, layerInfoLink, layerImagesLink, layerInfoAndLayerImagesLink]) {
			a.download = a.download.replaceAll('{{image}}', name);
		}

		flattenedImage.alt = flattenedImage.alt.replaceAll('{{image}}', name);

	};

	const readAsPsd = async file => {

		const arrayBuffer = await readAsArrayBuffer(file);
		// or
		// const arrayBuffer = await file.arrayBuffer();

		const data = new Uint8Array(arrayBuffer);

		const psd = new PSD(data);
		psd.parse();

		return psd;

	};

	const renderFlattenedImage = psd => {

		const dataUrl = psd.image.toBase64();

		flattenedImage.src = dataUrl;
		flattenedImageLink.href = dataUrl;

	};

	const getInfo = root => {

		const width = root.width;
		const height = root.height;

		const descendants = root.descendants().map(node => {

			const formattedNode = {};

			for (const [key, value] of Object.entries(node.export())) {
				if ( ! ['children', 'mask', 'image'].includes(key) ) {
					formattedNode[key] = value;
				}
			}

			formattedNode.path = node.path(true);

			if ( node.isLayer() ) {
				formattedNode.src = node.layer.image.toBase64();
			}

			return formattedNode;

		});

		return {
			width,
			height,
			descendants,
		};

	};

	const separateImageData = info => {

		const images = [];

		const width = info.width;
		const height = info.height;
		const descendants = info.descendants.map((node, i) => {
			if ( 'layer' === node.type ) {
				const newNode = Object.assign({}, node);
				newNode.src = i + '.png';
				images.push({ node: newNode, data: node.src });
				return newNode;
			} else {
				images.push({ node });
				return node;
			}
		});

		return {
			info: {
				width,
				height,
				descendants,
			},
			images,
		};

	};

	const renderInfo = (info, linkElement) => {

		const json = JSON.stringify(info, null, 4);
		const blob = new Blob([json], {type: 'application/json'});
		const url = URL.createObjectURL(blob);

		linkElement.href = url;

	};

	const toZipBlob = images => {

		const zip = new JSZip();

		const zipFileName = layerImagesLink.download;
		const [, folderName] = zipFileName.match(/^(.+?)(?:\.[^.]+)?$/);
		const folder = zip.folder(folderName);

		for (const image of images) {

			const node = image.node;

			// 
			const path = node.path
				.map(name => '"' + name.replaceAll('<', '&lt;').replaceAll('>', '&gt;') + '"').join('/');

			if ( 'layer' === node.type ) {

				const name = node.src;

				// 
				const [, data] = image.data.match(/^data:[^,]*;base64(?:;[^,]*)?,(.*)$/) ?? [];

				if ( ! data ) {
					throw new Error('Invalid image data');
				}

				folder.file(name, data, { base64: true });

				// result.insertAdjacentHTML('beforeend', '<a href="' + image.data + '" download="' + node.src + '">' + node.src + ' (' + path + ')</a><br>');

			} else if ( 'group' === node.type ) {
				// result.insertAdjacentHTML('beforeend', '<span>(' + path + ')</span><br>');
			}

		}

		return zip.generateAsync({ type: 'blob' });

	};

	const renderZip = blob => {
		const url = URL.createObjectURL(blob);
		layerImagesLink.href = url;
	};

	const render = async psd => {

		const root = psd.tree();
		console.time("get info");
		const info = getInfo(root);
		console.timeEnd("get info");

		const infoSeparatedImageData = separateImageData(info);
		const infoWithoutImageData = infoSeparatedImageData.info;
		const images = infoSeparatedImageData.images;

		console.time("to zip blob");
		const zipBlob = await toZipBlob(images);
		console.timeEnd("to zip blob");

		// 
		console.time("render flattened image");
		renderFlattenedImage(psd);
		console.timeEnd("render flattened image");

		renderInfo(infoWithoutImageData, layerInfoLink);
		console.time("render layer info and layer images");
		renderInfo(info, layerInfoAndLayerImagesLink);
		console.timeEnd("render layer info and layer images");

		renderZip(zipBlob);

		result.classList.add('displayed');

	};

	const renderError = error => {

		console.log(error);

		errorResult.classList.add('displayed');

	};

	// 
	const inputFileElement = document.getElementById('file');

	inputFileElement.addEventListener('change', async event => {

		// 
		inputFileElement.disabled = true;

		// 
		const files = event.target.files;

		if ( files.length === 0 ) {
			inputFileElement.disabled = false;
			return;
		}

		const file = files[0];

		// 
		errorResult.classList.remove('displayed');
		result.classList.remove('displayed');

		converting.classList.add('displayed');

		try {

			// 
			setImageFilename(file.name);

			// 
			const psd = await readAsPsd(file);

			await render(psd);

		} catch (error) {
			renderError(error);
		}

		converting.classList.remove('displayed');

		inputFileElement.disabled = false;

	});

})();
