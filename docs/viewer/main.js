(() => {

	const convertToFlattenedImage = (() => {

		const flattenedImage = document.getElementById('flattened-image');
		const flattenedImageLink = document.getElementById('flattened-image-link');

		const convertToFlattenedImage = async (viewer, name) => {

			const url = await viewer.getFlattenedImageURL();

			await new Promise((resolve, reject) => {
				flattenedImage.onload = () => resolve();
				flattenedImage.onerror = () => reject();

				flattenedImage.decoding = 'sync'; // メモ: ブラウザの設定によってはこれがないと表示が遅れる
				flattenedImage.alt = name;
				flattenedImage.src = url;
			});

			flattenedImageLink.download = name + '.png';
			flattenedImageLink.href = url;

		};

		return convertToFlattenedImage;

	})();

	const convertLayers = (() => {

		const layers = document.getElementById('layers');

		// メモ: デバッグ用
		const logNodes = nodes => {

			for (const node of nodes) {

				const output = {};

				for (const [key, value] of Object.entries(node)) {
					if ( ! ['left', 'right', 'top', 'bottom', 'width', 'height', 'src', 'children'].includes(key) ) {
						output[key] = value;
					}
				}

				if ( node.isGroup() ) {
					console.group(output);
					logNodes(node.children);
					console.groupEnd();
				} else {
					console.log(output);
				}

			}

		};

		// 
		const getImageClassName = node => {
			if ( node.isLayer() ) {
				return ' layer__image--layer';
			} else {
				return ' layer__image--group';
			}
		};

		const escapeHTML = html => html
			.replaceAll('&', '&amp;')
			.replaceAll('<', '&lt;').replaceAll('>', '&gt;')
			.replaceAll('"', '&quot;').replaceAll('\'', '&#39;');

		const getImageHTML = async (viewer, node) => {
			if ( node.isLayer() ) {
				// メモ: 処理が重いので保留
				// const imageURL = await viewer.getImageURL(node);
				const imageURL = node.image.src;
				return '<img lang="" alt="' + escapeHTML(node.name) + '" src="' + escapeHTML(imageURL) + '">';
			} else {
				return '📂';
			}
		};

		const renderLayerInfo = async (viewer, nodes, depth = 0) => {

			for (const node of nodes) {

				const imageClassName = getImageClassName(node);
				const imageHTML = await getImageHTML(viewer, node);

				const html = '<div class="layer">' +
					'<div class="layer__visible">' + (node.visible ? '👁' : '') + '</div>' +
					'<div class="layer__indent">' + '<div class="layer-indent"></div>'.repeat(depth) + '</div>' +
					'<div class="layer__image' + imageClassName + '">' + imageHTML + '</div>' +
					'<div class="layer__main">' +
					'<div class="layer-others"><div class="layer-opacity">' + Math.round(100 * node.opacity) + '%</div><div class="layer-blending-mode">' + escapeHTML(node.blendingMode) + '</div></div>' +
					'<div class="layer-name" lang="">' + escapeHTML(node.name) + '</div>' +
					'</div>';

				layers.insertAdjacentHTML('beforeend', html);

				if ( node.isGroup() ) {
					await renderLayerInfo(viewer, node.children, depth + 1);
				}

			}

		};

		const convertLayers = async viewer => {

			// logNodes(viewer.root);

			// 
			layers.innerHTML = '';

			await renderLayerInfo(viewer, viewer.root);

		};

		return convertLayers;

	})();

	const convert = (() => {

		const result = document.getElementById('result');
		const resultError = document.getElementById('result-error');
		const resultOk = document.getElementById('result-ok');

		// 
		const showElement = element => {
			element.classList.add('displayed');
		};

		const hideElement = element => {
			element.classList.remove('displayed');
		};

		// 
		const initElements = () => {

			hideElement(result);

			hideElement(resultError);
			hideElement(resultOk);

		};

		const getImageName = filename => {
			const [, name] = filename.match(/^(.+?)(?:\.[^.]+)?$/);
			return name;
		};

		const renderError = error => {
			console.error(error);
		};

		let prevViewer = null;

		const convert = async file => {

			initElements();

			if ( prevViewer ) {
				prevViewer.clear();
				prevViewer = null;
			}

			try {

				const viewer = await Viewer.fromFile(file);
				prevViewer = viewer;
				const name = getImageName(file.name);

				await convertToFlattenedImage(viewer, name);
				await convertLayers(viewer);

				showElement(resultOk);
				showElement(result);

			} catch (error) {
				renderError(error);
				showElement(resultError);
				showElement(result);
			}

		};

		return convert;

	})();

	(() => {

		const inputFileElement = document.getElementById('file');

		const convertOnEvent = async file => {

			inputFileElement.disabled = true;

			await convert(file);

			inputFileElement.disabled = false;

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
