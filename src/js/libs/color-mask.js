/*
 * miniPaint - https://github.com/viliusle/miniPaint
 * author: Vilius L.
 */

/**
 * Builds a selection mask of pixels similar in color to a starting pixel.
 * Shared by the Magic Eraser and Magic Wand tools.
 *
 * @param {Uint8ClampedArray} data RGBA pixel data (ImageData.data)
 * @param {int} W image width in pixels
 * @param {int} H image height in pixels
 * @param {int} x start pixel x
 * @param {int} y start pixel y
 * @param {int} tolerance 0-100, max allowed difference per channel
 * @param {Boolean} contiguous true = only pixels connected to (x, y) (flood fill),
 *     false = every matching pixel in the image
 * @returns {Uint8Array|null} W*H array, 1 = selected; null if (x, y) is outside the image
 */
export function build_color_mask(data, W, H, x, y, tolerance, contiguous) {
	x = parseInt(x);
	y = parseInt(y);
	if (x < 0 || y < 0 || x >= W || y >= H) {
		return null;
	}

	var sensitivity = tolerance * 255 / 100; //convert to 0-255 interval
	var mask = new Uint8Array(W * H);

	var k = (y * W + x) * 4;
	var r = data[k], g = data[k + 1], b = data[k + 2], a = data[k + 3];

	var matches = function (p) {
		var i = p * 4;
		return Math.abs(data[i] - r) <= sensitivity
			&& Math.abs(data[i + 1] - g) <= sensitivity
			&& Math.abs(data[i + 2] - b) <= sensitivity
			&& Math.abs(data[i + 3] - a) <= sensitivity;
	};

	//pushes one seed for every run of unfilled matching pixels in [from, to] (same row)
	var scan_row = function (from, to, stack) {
		var in_run = false;
		for (var q = from; q <= to; q++) {
			if (mask[q] == 0 && matches(q)) {
				if (!in_run) {
					stack.push(q);
					in_run = true;
				}
			}
			else {
				in_run = false;
			}
		}
	};

	if (contiguous) {
		//scanline flood fill (Smith 1979, "Tint Fill"; Heckbert 1990, "A Seed Fill Algorithm", Graphics Gems).
		//Instead of pushing every pixel, fill a whole horizontal run at once, then push one seed
		//per new run found in the rows above and below. Mask doubles as "visited".
		var stack = [y * W + x];
		while (stack.length > 0) {
			var seed = stack.pop();
			if (mask[seed] == 1)
				continue; //already filled by another run

			var row_start = seed - (seed % W);
			var row_end = row_start + W - 1;

			//extend run left and right
			var left = seed;
			while (left > row_start && mask[left - 1] == 0 && matches(left - 1)) {
				left--;
			}
			var right = seed;
			while (right < row_end && mask[right + 1] == 0 && matches(right + 1)) {
				right++;
			}
			for (var p = left; p <= right; p++) {
				mask[p] = 1;
			}

			//look for new runs directly above and below this run
			if (row_start > 0) {
				scan_row(left - W, right - W, stack);
			}
			if (row_end < W * H - 1) {
				scan_row(left + W, right + W, stack);
			}
		}
	}
	else {
		//global - every matching pixel
		for (var p = 0; p < W * H; p++) {
			if (matches(p)) {
				mask[p] = 1;
			}
		}
	}

	return mask;
}

/**
 * Converts a mask into a canvas: selected pixels opaque white, others transparent.
 * Useful with globalCompositeOperation ("destination-out" to erase, "destination-in" to keep).
 *
 * @param {Uint8Array} mask
 * @param {int} W
 * @param {int} H
 * @returns {HTMLCanvasElement}
 */
export function mask_to_canvas(mask, W, H) {
	var canvas = document.createElement('canvas');
	canvas.width = W;
	canvas.height = H;
	var ctx = canvas.getContext("2d");
	var img = ctx.createImageData(W, H);
	var d = img.data;
	for (var p = 0; p < mask.length; p++) {
		if (mask[p] == 1) {
			var i = p * 4;
			d[i] = 255;
			d[i + 1] = 255;
			d[i + 2] = 255;
			d[i + 3] = 255;
		}
	}
	ctx.putImageData(img, 0, 0);
	return canvas;
}
