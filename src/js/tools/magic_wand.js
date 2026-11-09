import app from './../app.js';
import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';
import Base_layers_class from './../core/base-layers.js';
import Helper_class from './../libs/helpers.js';
import { build_color_mask, mask_to_canvas } from './../libs/color-mask.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';

/**
 * Magic Wand - selects pixels of similar color (based on the Magic Eraser).
 *
 * Click: selection using "Mode" (New / Add / Subtract), Shift+click: add, Alt+click: subtract.
 * Delete: erase selected pixels, Ctrl+J (handled in layer/new.js): copy selected pixels to a new layer,
 * Ctrl+E: invert selection, Ctrl+A: select all, Escape: clear selection.
 * All selection changes are undoable.
 */
class Magic_wand_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.Base_layers = new Base_layers_class();
		this.Helper = new Helper_class();
		this.ctx = ctx;
		this.name = 'magic_wand';
		this.working = false;

		// current selection: {layer_id, width, height, mask (Uint8Array, 1 = selected), count}
		this.selection = null;
		// cached overlay (tint + outline), rebuilt only when the selection changes
		this.overlay_canvas = null;
	}

	load() {
		var _this = this;

		//mouse events
		document.addEventListener('mousedown', function (event) {
			_this.dragStart(event);
		});
		document.addEventListener('touchstart', function (event) {
			_this.dragStart(event);
		});

		//keyboard
		document.addEventListener('keydown', function (event) {
			if (config.TOOL.name != _this.name)
				return;
			if (_this.Helper.is_input(event.target))
				return;

			var key = event.key.toLowerCase();
			var ctrlDown = event.ctrlKey || event.metaKey;

			if (key == 'a' && ctrlDown) {
				event.preventDefault();
				_this.select_all();
				return;
			}
			if (_this.selection == null)
				return;

			if (key == 'escape') {
				_this.clear_selection();
			}
			else if (key == 'delete') {
				event.preventDefault();
				_this.delete_selection();
			}
			else if (key == 'e' && ctrlDown) {
				event.preventDefault();
				_this.invert_selection();
			}
		}, false);
	}

	dragStart(event) {
		if (config.TOOL.name != this.name)
			return;
		this.mousedown(event);
	}

	async mousedown(e) {
		var mouse = this.get_mouse_info(e);
		if (mouse.click_valid == false) {
			return;
		}
		if (this.working == true) {
			return;
		}
		if (!this.check_layer()) {
			return;
		}

		//modifier keys override the Mode setting for one click
		var mode = this.get_mode();
		if (e.shiftKey) {
			mode = 'add';
		}
		else if (e.altKey) {
			mode = 'subtract';
			e.preventDefault();
		}

		this.working = true;
		try {
			await this.select_at(mouse, mode);
		}
		finally {
			this.working = false;
		}
	}

	/**
	 * @returns {string} 'replace', 'add' or 'subtract' - from the Mode dropdown
	 */
	get_mode() {
		var mode = this.getParams().mode;
		if (mode && typeof mode == 'object') {
			mode = mode.value;
		}
		if (mode == 'Add')
			return 'add';
		if (mode == 'Subtract')
			return 'subtract';
		return 'replace';
	}

	check_layer() {
		if (config.layer.type != 'image') {
			alertify.error('This layer must contain an image. Please convert it to raster to apply this tool.');
			return false;
		}
		if (config.layer.is_vector == true) {
			alertify.error('Layer is vector, convert it to raster to apply this tool.');
			return false;
		}
		if (config.layer.rotate || 0 > 0) {
			alertify.error('Magic Wand on rotated object is disabled. Please rasterize first.');
			return false;
		}
		return true;
	}

	/**
	 * builds mask at mouse position and merges it with current selection
	 */
	async select_at(mouse, mode) {
		var params = this.getParams();
		var layer = config.layer;

		//get layer pixels at original size
		var canvas = this.get_layer_canvas(layer);
		var W = canvas.width;
		var H = canvas.height;

		//canvas coords -> layer pixel coords
		var x = Math.round(this.adaptSize(Math.round(mouse.x) - layer.x, 'width'));
		var y = Math.round(this.adaptSize(Math.round(mouse.y) - layer.y, 'height'));
		if (x < 0 || y < 0 || x >= W || y >= H) {
			//clicked outside the layer
			if (mode == 'replace') {
				await this.clear_selection();
			}
			return;
		}

		var data = canvas.getContext("2d").getImageData(0, 0, W, H).data;
		var mask = build_color_mask(data, W, H, x, y, params.power, params.contiguous);
		if (mask === null) {
			return;
		}

		//combine with existing selection on same layer
		var current = this.is_selection_valid() ? this.selection.mask : null;
		if (current !== null && mode == 'add') {
			for (var p = 0; p < mask.length; p++) {
				mask[p] = mask[p] | current[p];
			}
		}
		else if (mode == 'subtract') {
			if (current === null) {
				return; //nothing to subtract from
			}
			for (var p = 0; p < mask.length; p++) {
				mask[p] = current[p] & (mask[p] ^ 1);
			}
		}

		await this.set_selection(layer, mask, W, H);
	}

	/**
	 * creates undoable action that sets new selection
	 */
	async set_selection(layer, mask, W, H) {
		var count = 0;
		for (var p = 0; p < mask.length; p++) {
			count += mask[p];
		}
		if (count == 0) {
			await this.clear_selection();
			return;
		}

		await app.State.do_action(
			new app.Actions.Set_magic_wand_selection_action({
				layer_id: layer.id,
				width: W,
				height: H,
				mask: mask,
				count: count,
			})
		);
	}

	/**
	 * applies selection directly (no undo history) - used by Set_magic_wand_selection_action
	 *
	 * @param {object|null} selection
	 */
	apply_selection(selection) {
		this.selection = selection;
		this.overlay_canvas = selection ? this.build_overlay(selection.mask, selection.width, selection.height) : null;
		config.need_render = true;
	}

	/**
	 * selection is only valid while the same layer is active and its size has not changed
	 */
	is_selection_valid() {
		var sel = this.selection;
		if (sel == null || config.layer == null)
			return false;
		var layer = config.layer;
		return sel.layer_id == layer.id
			&& sel.width == layer.width_original
			&& sel.height == layer.height_original;
	}

	/**
	 * builds cached overlay image: semi-transparent green tint over selected pixels,
	 * plus a black/white dashed outline on edge pixels (selected pixel next to unselected one)
	 */
	build_overlay(mask, W, H) {
		var canvas = document.createElement('canvas');
		canvas.width = W;
		canvas.height = H;
		var ctx = canvas.getContext("2d");
		var img = ctx.createImageData(W, H);
		var d = img.data;

		for (var y = 0; y < H; y++) {
			for (var x = 0; x < W; x++) {
				var p = y * W + x;
				if (mask[p] == 0)
					continue;
				var i = p * 4;
				var is_edge = x == 0 || y == 0 || x == W - 1 || y == H - 1
					|| mask[p - 1] == 0 || mask[p + 1] == 0 || mask[p - W] == 0 || mask[p + W] == 0;

				if (is_edge) {
					//alternate black and white every 4 pixels - static "marching ants"
					var c = (((x + y) >> 2) & 1) ? 255 : 0;
					d[i] = c;
					d[i + 1] = c;
					d[i + 2] = c;
					d[i + 3] = 255;
				}
				else {
					//tint - same color as rectangle selection
					d[i] = 0;
					d[i + 1] = 255;
					d[i + 2] = 0;
					d[i + 3] = 77;
				}
			}
		}
		ctx.putImageData(img, 0, 0);
		return canvas;
	}

	/**
	 * called by renderer after layers are drawn (canvas coordinates, zoom already applied)
	 */
	render_overlay(ctx) {
		if (this.overlay_canvas == null || !this.is_selection_valid()) {
			//nothing selected, or layer changed/resized - selection does not match pixels
			return;
		}
		var layer = config.layer;

		ctx.save();
		ctx.globalAlpha = 1;
		ctx.globalCompositeOperation = 'source-over';
		ctx.imageSmoothingEnabled = false;
		ctx.drawImage(this.overlay_canvas, layer.x, layer.y, layer.width, layer.height);
		ctx.restore();
	}

	/**
	 * returns copy of layer pixels at original size
	 */
	get_layer_canvas(layer) {
		var canvas = document.createElement('canvas');
		canvas.width = layer.width_original;
		canvas.height = layer.height_original;
		canvas.getContext("2d").drawImage(layer.link, 0, 0);
		return canvas;
	}

	/**
	 * mask as canvas, optionally feathered by 1px (anti-aliasing)
	 */
	get_mask_canvas() {
		var sel = this.selection;
		var mask_canvas = mask_to_canvas(sel.mask, sel.width, sel.height);
		if (this.getParams().anti_aliasing != true) {
			return mask_canvas;
		}
		var soft = document.createElement('canvas');
		soft.width = sel.width;
		soft.height = sel.height;
		var ctx = soft.getContext("2d");
		ctx.filter = 'blur(1px)';
		ctx.drawImage(mask_canvas, 0, 0);
		return soft;
	}

	/**
	 * returns false (and shows message) if there is no usable selection
	 */
	require_selection() {
		if (!this.is_selection_valid()) {
			alertify.error('Nothing is selected.');
			return false;
		}
		return true;
	}

	/**
	 * erases selected pixels from layer
	 */
	async delete_selection() {
		if (!this.require_selection()) {
			return;
		}

		var canvas = this.get_layer_canvas(config.layer);
		var ctx = canvas.getContext("2d");
		ctx.globalCompositeOperation = 'destination-out';
		ctx.drawImage(this.get_mask_canvas(), 0, 0);

		await app.State.do_action(
			new app.Actions.Bundle_action('magic_wand_delete', 'Delete Magic Wand Selection', [
				new app.Actions.Update_layer_image_action(canvas, config.layer.id),
				new app.Actions.Set_magic_wand_selection_action(null),
			])
		);
	}

	/**
	 * copies selected pixels into new layer (cropped to selection bounds)
	 */
	async copy_to_new_layer() {
		if (!this.require_selection()) {
			return;
		}
		var sel = this.selection;
		var layer = config.layer;

		//bounding box of selection
		var min_x = sel.width, min_y = sel.height, max_x = -1, max_y = -1;
		for (var y = 0; y < sel.height; y++) {
			for (var x = 0; x < sel.width; x++) {
				if (sel.mask[y * sel.width + x] == 1) {
					if (x < min_x) min_x = x;
					if (x > max_x) max_x = x;
					if (y < min_y) min_y = y;
					if (y > max_y) max_y = y;
				}
			}
		}
		var bw = max_x - min_x + 1;
		var bh = max_y - min_y + 1;

		//keep only selected pixels
		var full = this.get_layer_canvas(layer);
		var full_ctx = full.getContext("2d");
		full_ctx.globalCompositeOperation = 'destination-in';
		full_ctx.drawImage(this.get_mask_canvas(), 0, 0);

		//crop
		var cropped = document.createElement('canvas');
		cropped.width = bw;
		cropped.height = bh;
		cropped.getContext("2d").drawImage(full, min_x, min_y, bw, bh, 0, 0, bw, bh);

		//layer may be scaled on canvas
		var scale_x = layer.width / layer.width_original;
		var scale_y = layer.height / layer.height_original;

		await app.State.do_action(
			new app.Actions.Bundle_action('magic_wand_copy', 'Magic Wand Copy to Layer', [
				new app.Actions.Set_magic_wand_selection_action(null),
				new app.Actions.Insert_layer_action({
					name: 'Magic Wand Selection #' + app.Layers.auto_increment,
					type: 'image',
					link: cropped,
					x: Math.round(layer.x + min_x * scale_x),
					y: Math.round(layer.y + min_y * scale_y),
					width: Math.round(bw * scale_x),
					height: Math.round(bh * scale_y),
					width_original: bw,
					height_original: bh,
				})
			])
		);
	}

	async invert_selection() {
		if (!this.require_selection()) {
			return;
		}
		var sel = this.selection;
		var mask = new Uint8Array(sel.mask.length);
		for (var p = 0; p < mask.length; p++) {
			mask[p] = sel.mask[p] ^ 1;
		}
		await this.set_selection(config.layer, mask, sel.width, sel.height);
	}

	async select_all() {
		if (!this.check_layer()) {
			return;
		}
		var W = config.layer.width_original;
		var H = config.layer.height_original;
		var mask = new Uint8Array(W * H).fill(1);
		await this.set_selection(config.layer, mask, W, H);
	}

	async clear_selection() {
		if (this.selection == null) {
			return;
		}
		await app.State.do_action(
			new app.Actions.Set_magic_wand_selection_action(null)
		);
	}

	/**
	 * called when switching to another tool - returned actions are undone if tool switch is undone
	 */
	on_leave() {
		if (this.selection == null) {
			return [];
		}
		return [
			new app.Actions.Set_magic_wand_selection_action(null)
		];
	}

}
export default Magic_wand_class;
