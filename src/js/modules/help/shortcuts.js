import Dialog_class from './../../libs/popup.js';

class Help_shortcuts_class {

	constructor() {
		this.POP = new Dialog_class();
	}

	//shortcuts
	shortcuts() {
		var settings = {
			title: 'Keyboard Shortcuts',
			className: 'shortcuts',
			params: [
				{title: "F", value: 'Auto Adjust Colors'},
				{title: "F3 / &#8984; + F", value: 'Search'},
				{title: "Ctrl + C", value: 'Copy to Clipboard'},
				{title: "D", value: 'Duplicate'},
				{title: "S", value: 'Export'},
				{title: "G", value: 'Grid on/off'},
				{title: "I", value: 'Information'},
				{title: "N", value: 'New layer'},
				{title: "O", value: 'Open'},
				{title: "CTRL + V", value: 'Paste'},
				{title: "F10", value: 'Quick Load'},
				{title: "F9", value: 'Quick Save'},
				{title: "R", value: 'Resize'},
				{title: "L", value: 'Rotate left'},
				{title: "U", value: 'Ruler'},
				{title: "Shift + S", value: 'Save As'},
				{title: "CTRL + A", value: 'Select All'},
				{title: "H", value: 'Shapes'},
				{title: "T", value: 'Trim'},
				{title: "CTRL + Z", value: 'Undo'},
				{title: "Del", value: 'Delete selection'},
				{title: "Esc", value: 'Clear selection'},
				{title: "CTRL + E", value: 'Invert selection (Magic Wand)'},
				{title: "CTRL + J", value: 'Copy selection to new layer'},
				{title: "Shift + click", value: 'Add to selection (Magic Wand)'},
				{title: "Alt + click", value: 'Subtract from selection (Magic Wand)'},
				{title: "Scroll up", value: 'Zoom in'},
				{title: "Scroll down", value: 'Zoom out'},
			],
		};
		this.POP.show(settings);
	}

}

export default Help_shortcuts_class;
