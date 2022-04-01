(() => {

	const ObjectURLSet = class {

		_set = new Set();

		create(obj) {
			const objURL = URL.createObjectURL(obj);
			this._set.add(objURL);
			return objURL;
		}

		revoke(objURL) {
			URL.revokeObjectURL(objURL);
			this._set.delete(objURL);
		}

		clear() {
			for (const objURL of this._set) {
				this.revoke(objURL);
			}
		}

	};

	const PSDBlendModes = (() => {

		/*
		 * ['Key', 'Name', 'Canvas Composite Operation']
		 */
		const PSD_BLEND_MODES = [
			['pass', 'passthru', null],
			['norm', 'normal', 'source-over'],
			['mul ', 'multiply', 'multiply'],
			['lddg', 'linear_dodge', 'lighter'], // メモ: 画像編集ソフトウェアにより合成方法が異なる
			['fsub', 'subtract', null],
			['fdiv', 'divide', null],
			['over', 'overlay', 'overlay'],
			['scrn', 'screen', 'screen'],
			['lite', 'lighten', 'lighten'],
			['dark', 'darken', 'darken'],
			['diff', 'difference', 'difference'],
			['smud', 'exclusion', 'exclusion'],
			['div ', 'color_dodge', 'color-dodge'],
			['idiv', 'color_burn', 'color-burn'],
			['sLit', 'soft_light', 'soft-light'],
			['hLit', 'hard_light', 'hard-light'],
			['hue ', 'hue', 'hue'],
			['sat ', 'saturation', 'saturation'],
			['colr', 'color', 'color'],
			['lum ', 'luminosity', 'luminosity'],
			['diss', 'dissolve', null],
			['lbrn', 'linear_burn', null],
			['vLit', 'vivid_light', null],
			['lLit', 'linear_light', null],
			['pLit', 'pin_light', null],
			['hMix', 'hard_mix', null],
			['dkCl', 'darker_color', null],
			['lgCl', 'lighter_color', null],
		];

		const CANVAS_BLEND_MODES = new Map(PSD_BLEND_MODES.map(([, name, op]) => [name, op]));

		const getCanvasBlendMode = name => CANVAS_BLEND_MODES.get(name) ?? null;

		return {
			getCanvasBlendMode,
		};

	})();

	const Viewer = (() => {

		const readAsText = blob => new Promise((resolve, reject) => {

			const reader = new FileReader();

			reader.onload = () => resolve(reader.result);
			reader.onerror = () => reject(reader.error);

			reader.readAsText(blob);

		});

		const loadImage = src => new Promise((resolve, reject) => {

			const image = new Image();

			image.onload = () => resolve(image);
			image.onerror = () => reject();

			image.src = src;

		});

		// 
		const ParsedNode = class {

			index;

			_isGroup;
			_isLayer;

			name;

			visible;
			opacity;
			blendingMode;

			width;
			height;

			left;
			right;
			top;
			bottom;

			parentNodeIndex;

			children;

			image;

			passthruBlending;

			constructor(node, index, image = null) {

				this.index = index;

				// 
				this._isGroup = 'group' === node.type;
				this._isLayer = 'layer' === node.type;

				this.name = node.name;

				this.visible = node.visible;
				this.opacity = node.opacity;
				this.blendingMode = node.blendingMode;

				this.width = node.width;
				this.height = node.height;

				this.left = node.left;
				this.right = node.right;
				this.top = node.top;
				this.bottom = node.bottom;

				// 
				// メモ: this.opacity が数値ですらないとき、
				//       (this.opacity < 0 || 1 < this.opacity)
				//       は期待通りの動作しない
				if ( ! (0 <= this.opacity && this.opacity <= 1) ) {
					throw new Error('Invalid image data');
				}

				// 
				this.parentNodeIndex = node.parentNodeIndex;

				this.children = this.isGroup() ? [] : null;

				this.image = this.isLayer() ? image : null;

				this.passthruBlending = this.isGroup() && this.blendingMode === 'passthru';

			}

			getCanvasBlendMode() {

				const canvasBlendMode = PSDBlendModes.getCanvasBlendMode(this.blendingMode);

				if ( ! canvasBlendMode ) {
					console.error('Unsupported Blending Mode');
					return 'source-over';
				}

				return canvasBlendMode;

			}

			isGroup() {
				return this._isGroup;
			}

			isLayer() {
				return this._isLayer;
			}

		};

		// 
		const useCanvasToDataURL = ! HTMLCanvasElement.prototype.toBlob;

		const ImageURLSet = class {

			_objURLSet = new ObjectURLSet();

			async toImageURL(canvas) {

				if ( ! useCanvasToDataURL ) {
					const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
					const objURL = this._objURLSet.create(blob);
					return objURL;
				} else {
					const dataURL = canvas.toDataURL('image/png');
					return dataURL;
				}

			}

			async parseNode(node, index) {

				if ( 'group' === node.type ) {
					return new ParsedNode(node, index);
				} else if ( 'layer' === node.type ) {

					const src = node.src;

					const [, type, data] = src.match(/^data:([^,;]*)[^,]*;base64,(.*)$/) || [];

					if ( data ) {

						const binaryString = atob(data);
						const uint8Array = new Uint8Array(binaryString.length);

						for (let i = 0; i < binaryString.length; i++) {
							uint8Array[i] = binaryString.charCodeAt(i);
						}

						const blob = new Blob([uint8Array.buffer], {type});

						// メモ: ブラウザによっては Data URL 不可
						// const response = await fetch(src);
						// const blob = await response.blob();

						// 
						const imageURL = this._objURLSet.create(blob);

						const image = await loadImage(imageURL);

						return new ParsedNode(node, index, image);

					} else {
						throw new Error('Invalid image data'); // TODO: data URL でない場合
					}

				} else {
					throw new Error('Invalid image data');
				}

			}

			clear() {
				this._objURLSet.clear();
			}

		};

		// 
		const Viewer = class {

			_canvas;
			_context;

			_imageURLSet;

			width;
			height;

			root = [];

			constructor(width, height, parsedDescendants, imageURLSet) {

				const canvas = document.createElement('canvas');
				const context = canvas.getContext('2d');

				canvas.width = width;
				canvas.height = height;

				this._canvas = canvas;
				this._context = context;

				this._context.globalCompositeOperation = 'copy';

				// 
				this.width = width;
				this.height = height;

				const length = parsedDescendants.length;

				for (const node of parsedDescendants) {
					const i = node.parentNodeIndex;
					// メモ: node.parentNodeIndex が数値ですらないとき、
					//       (i < 0 || length <= i)
					//       は期待通りの動作しない
					if ( ! (0 <= i && i < length) || i === node.index ) {
						throw new Error('Invalid image data');
					}
					const children = null === i ? this.root : parsedDescendants[i].children;
					children.push(node);
				}

				this._imageURLSet = imageURLSet;

			}

			static async from(obj) {

				const imageURLSet = new ImageURLSet();

				const parsedDescendantPromises = obj.descendants.map((node, i) => imageURLSet.parseNode(node, i));
				const parsedDescendants = await Promise.all(parsedDescendantPromises);

				return new Viewer(obj.width, obj.height, parsedDescendants, imageURLSet);

			};

			static async fromFile(file) {

				const text = await readAsText(file);
				// or
				// const arrayBuffer = await file.text();

				const obj = JSON.parse(text);

				return Viewer.from(obj);

			};

			/**
			 * ノードの画像の位置と大きさを全体に合わせて取得
			 */
			async getImageURL(node) {

				this._context.drawImage(node.image, node.left, node.top);

				// 
				const imageURL = await this._imageURLSet.toImageURL(this._canvas);

				return imageURL;

			}

			_drawGroupImage(node, context) {

				if ( node.passthruBlending ) {
					this._drawNodeImages(node.children, context);
				} else {

					const canvasChildren = document.createElement('canvas');
					const contextChildren = canvasChildren.getContext('2d');

					canvasChildren.width = this.width;
					canvasChildren.height = this.height;

					this._drawNodeImages(node.children, contextChildren);

					// 
					context.globalAlpha = node.opacity;
					context.globalCompositeOperation = node.getCanvasBlendMode();
					context.drawImage(canvasChildren, 0, 0);

				}

			}

			_drawLayerImage(node, context) {

				context.globalAlpha = node.opacity;
				context.globalCompositeOperation = node.getCanvasBlendMode();
				context.drawImage(node.image, node.left, node.top);

			}

			_drawNodeImages(nodes, context) {

				for (let i = nodes.length - 1; i >= 0; i--) {

					const node = nodes[i];

					if ( ! node.visible ) continue;

					if ( node.isGroup() ) {
						this._drawGroupImage(node, context);
					} else if ( node.isLayer() ) {
						this._drawLayerImage(node, context);
					}

				}

			}

			async getFlattenedImageURL() {

				const canvasRoot = document.createElement('canvas');
				const contextRoot = canvasRoot.getContext('2d');

				canvasRoot.width = this.width;
				canvasRoot.height = this.height;

				this._drawNodeImages(this.root, contextRoot);

				// 
				const imageURL = await this._imageURLSet.toImageURL(canvasRoot);

				return imageURL;

			}

			clear() {

				this._canvas = null;
				this._context = null;

				this._imageURLSet.clear();

				this.width = 0;
				this.height = 0;

				this.root = null;

			}

		};

		return Viewer;

	})();

	window.Viewer = Viewer;

})();
