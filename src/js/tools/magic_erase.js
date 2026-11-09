import app from './../app.js';
import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';
import Base_layers_class from './../core/base-layers.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';
import { build_color_mask, mask_to_canvas } from './../libs/color-mask.js';

class Magic_erase_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.Base_layers = new Base_layers_class();
		this.ctx = ctx;
		this.name = 'magic_erase';
		this.working = false;
	}

	dragStart(event) {
		var _this = this;
		if (config.TOOL.name != _this.name)
			return;
		_this.mousedown(event);
	}

	load() {
		var _this = this;

		//mouse events
		document.addEventListener('mousedown', function (event) {
			_this.dragStart(event);
		});

		// collect touch events
		document.addEventListener('touchstart', function (event) {
			_this.dragStart(event);
		});
	}

	mousedown(e) {
		var mouse = this.get_mouse_info(e);
		if (mouse.click_valid == false) {
			return;
		}
		if (config.layer.rotate || 0 > 0) {
			alertify.error('Erase on rotate object is disabled. Please rasterize first.');
			return;
		}

		this.magic_erase(mouse);
	}

	async magic_erase(mouse) {
		var params = this.getParams();

		if(this.working == true){
			return;
		}

		if (config.layer.type != 'image') {
			alertify.error('This layer must contain an image. Please convert it to raster to apply this tool.');
			return;
		}
		if (config.layer.is_vector == true) {
			alertify.error('Layer is vector, convert it to raster to apply this tool.');
			return;
		}

		//get canvas from layer
		var canvas = document.createElement('canvas');
		var ctx = canvas.getContext("2d");
		canvas.width = config.layer.width_original;
		canvas.height = config.layer.height_original;
		ctx.drawImage(config.layer.link, 0, 0);

		var mouse_x = Math.round(mouse.x) - config.layer.x;
		var mouse_y = Math.round(mouse.y) - config.layer.y;

		//adapt to origin size
		mouse_x = this.adaptSize(mouse_x, 'width');
		mouse_y = this.adaptSize(mouse_y, 'height');

		//convert float coords to integers
		mouse_x = Math.round(mouse_x);
		mouse_y = Math.round(mouse_y);

		//change
		this.working = true;
		this.magic_erase_general(ctx, canvas.width, canvas.height,
			mouse_x, mouse_y, params.power, params.anti_aliasing, params.contiguous);

		app.State.do_action(
			new app.Actions.Bundle_action('magic_erase_tool', 'Magic Eraser Tool', [
				new app.Actions.Update_layer_image_action(canvas)
			])
		);
		//prevent crash bug on touch screen - hard to explain and debug
		await new Promise(r => setTimeout(r, 10));
		this.working = false;
	}

	/**
	 * apply magic erase
	 *
	 * @param {ctx} context
	 * @param {int} W
	 * @param {int} H
	 * @param {int} x
	 * @param {int} y
	 * @param {int} sensitivity max 100
	 * @param {Boolean} anti_aliasing
	 * @param {Boolean} contiguous true = erase only connected pixels, false = erase matching color everywhere
	 */
	magic_erase_general(context, W, H, x, y, sensitivity, anti_aliasing, contiguous = true) {
		var img = context.getImageData(0, 0, W, H);
		var k = ((parseInt(y) * W) + parseInt(x)) * 4;
		if (img.data[k + 3] == 0) {
			//clicked on transparent pixel - nothing to erase
			return false;
		}

		var mask = build_color_mask(img.data, W, H, x, y, sensitivity, contiguous);
		if (mask === null) {
			return false;
		}

		//destination-out + blur = anti-aliasing
		var canvasTemp = mask_to_canvas(mask, W, H);
		context.globalCompositeOperation = "destination-out";
		if (anti_aliasing == true) {
			context.filter = 'blur(1px)';
		}
		context.drawImage(canvasTemp, 0, 0);
	}

}
export default Magic_erase_class;
