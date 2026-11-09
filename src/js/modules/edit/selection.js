import app from './../../app.js';
import config from './../../config.js';
import Base_layers_class from './../../core/base-layers.js';
import Selection_class from './../../tools/selection.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';

class Edit_selection_class {

	constructor() {
		this.Base_layers = new Base_layers_class();
		this.Selection = new Selection_class(this.Base_layers.ctx);
	}

	get_magic_wand() {
		if (config.TOOL.name != 'magic_wand')
			return null;
		return app.GUI.GUI_tools.tools_modules.magic_wand.object;
	}

	select_all() {
		var wand = this.get_magic_wand();
		if (wand) {
			wand.select_all();
			return;
		}
		if (config.layer.type != 'image') {
			alertify.error('This layer must contain an image. Please convert it to raster to apply this tool.');
			return;
		}
		this.Selection.select_all();
	}

	delete() {
		var wand = this.get_magic_wand();
		if (wand) {
			wand.delete_selection();
			return;
		}
		this.Selection.delete_selection();
	}

	invert() {
		var wand = this.get_magic_wand();
		if (wand == null) {
			alertify.error('Invert Selection works with the Magic Wand tool.');
			return;
		}
		wand.invert_selection();
	}
}

export default Edit_selection_class;
