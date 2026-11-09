import app from '../app.js';
import { Base_action } from './base.js';

export class Set_magic_wand_selection_action extends Base_action {
	/**
	 * Sets (or clears) the Magic Wand selection mask, so selection changes can be undone.
	 *
	 * @param {object|null} selection - {layer_id, width, height, mask, count}, or null to clear
	 */
	constructor(selection) {
		super('set_magic_wand_selection', 'Magic Wand Selection');
		this.new_selection = selection;
		this.old_selection = null;
	}

	get_tool() {
		return app.GUI.GUI_tools.tools_modules.magic_wand.object;
	}

	async do() {
		super.do();
		const tool = this.get_tool();
		this.old_selection = tool.selection;
		tool.apply_selection(this.new_selection);

		// masks use 1 byte per pixel
		this.memory_estimate = (this.new_selection ? this.new_selection.mask.length : 0)
			+ (this.old_selection ? this.old_selection.mask.length : 0);
	}

	async undo() {
		super.undo();
		this.get_tool().apply_selection(this.old_selection);
		this.old_selection = null;
	}

	free() {
		this.new_selection = null;
		this.old_selection = null;
	}
}
