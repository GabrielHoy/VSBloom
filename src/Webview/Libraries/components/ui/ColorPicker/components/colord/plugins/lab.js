var a = (a) => ('string' == typeof a ? a.length > 0 : 'number' == typeof a),
	t = (a, t, o) => (
		void 0 === t && (t = 0), void 0 === o && (o = 10 ** t), Math.round(o * a) / o + 0
	),
	o = (a, t, o) => (void 0 === t && (t = 0), void 0 === o && (o = 1), a > o ? o : a > t ? a : t),
	r = (a) => {
		var t = a / 255;
		return t < 0.04045 ? t / 12.92 : ((t + 0.055) / 1.055) ** 2.4;
	},
	h = (a) => 255 * (a > 0.0031308 ? 1.055 * a ** (1 / 2.4) - 0.055 : 12.92 * a),
	n = 96.422,
	p = 100,
	M = 82.521,
	u = (a) => {
		var t,
			r,
			n = {
				x: 0.9555766 * (t = a).x + -0.0230393 * t.y + 0.0631636 * t.z,
				y: -0.0282895 * t.x + 1.0099416 * t.y + 0.0210077 * t.z,
				z: 0.0122982 * t.x + -0.020483 * t.y + 1.3299098 * t.z,
			};
		return (
			(r = {
				r: h(0.032404542 * n.x - 0.015371385 * n.y - 0.004985314 * n.z),
				g: h(-0.00969266 * n.x + 0.018760108 * n.y + 41556e-8 * n.z),
				b: h(556434e-9 * n.x - 0.002040259 * n.y + 0.010572252 * n.z),
				a: a.a,
			}),
			{ r: o(r.r, 0, 255), g: o(r.g, 0, 255), b: o(r.b, 0, 255), a: o(r.a) }
		);
	},
	e = (a) => {
		var t = r(a.r),
			h = r(a.g),
			u = r(a.b);
		return ((a) => ({ x: o(a.x, 0, n), y: o(a.y, 0, p), z: o(a.z, 0, M), a: o(a.a) }))(
			((a) => ({
				x: 1.0478112 * a.x + 0.0228866 * a.y + -0.050127 * a.z,
				y: 0.0295424 * a.x + 0.9904844 * a.y + -0.0170491 * a.z,
				z: -0.0092345 * a.x + 0.0150436 * a.y + 0.7521316 * a.z,
				a: a.a,
			}))({
				x: 100 * (0.4124564 * t + 0.3575761 * h + 0.1804375 * u),
				y: 100 * (0.2126729 * t + 0.7151522 * h + 0.072175 * u),
				z: 100 * (0.0193339 * t + 0.119192 * h + 0.9503041 * u),
				a: a.a,
			}),
		);
	},
	w = 216 / 24389,
	b = 24389 / 27,
	i = (t) => {
		var r = t.l,
			h = t.a,
			n = t.b,
			p = t.alpha,
			M = void 0 === p ? 1 : p;
		if (!a(r) || !a(h) || !a(n)) return null;
		var u = ((a) => ({ l: o(a.l, 0, 400), a: a.a, b: a.b, alpha: o(a.alpha) }))({
			l: Number(r),
			a: Number(h),
			b: Number(n),
			alpha: Number(M),
		});
		return l(u);
	},
	l = (a) => {
		var t = (a.l + 16) / 116,
			o = a.a / 500 + t,
			r = t - a.b / 200;
		return u({
			x: (o ** 3 > w ? o ** 3 : (116 * o - 16) / b) * n,
			y: (a.l > 8 ? ((a.l + 16) / 116) ** 3 : a.l / b) * p,
			z: (r ** 3 > w ? r ** 3 : (116 * r - 16) / b) * M,
			a: a.alpha,
		});
	};
module.exports = (a, r) => {
	(a.prototype.toLab = function () {
		return (
			(o = e(this.rgba)),
			(h = o.y / p),
			(u = o.z / M),
			(r = (r = o.x / n) > w ? Math.cbrt(r) : (b * r + 16) / 116),
			(a = {
				l: 116 * (h = h > w ? Math.cbrt(h) : (b * h + 16) / 116) - 16,
				a: 500 * (r - h),
				b: 200 * (h - (u = u > w ? Math.cbrt(u) : (b * u + 16) / 116)),
				alpha: o.a,
			}),
			{ l: t(a.l, 2), a: t(a.a, 2), b: t(a.b, 2), alpha: t(a.alpha, 3) }
		);
		var a, o, r, h, u;
	}),
		(a.prototype.delta = function (r) {
			void 0 === r && (r = '#FFF');
			var h = r instanceof a ? r : new a(r),
				n =
					((a, t) => {
						var o = a.l,
							r = a.a,
							h = a.b,
							n = t.l,
							p = t.a,
							M = t.b,
							u = 180 / Math.PI,
							e = Math.PI / 180,
							w = (r ** 2 + h ** 2) ** 0.5,
							b = (p ** 2 + M ** 2) ** 0.5,
							i = (o + n) / 2,
							l = ((w + b) / 2) ** 7,
							c = 0.5 * (1 - (l / (l + 25 ** 7)) ** 0.5),
							f = r * (1 + c),
							y = p * (1 + c),
							v = (f ** 2 + h ** 2) ** 0.5,
							x = (y ** 2 + M ** 2) ** 0.5,
							z = (v + x) / 2,
							s = 0 === f && 0 === h ? 0 : Math.atan2(h, f) * u,
							d = 0 === y && 0 === M ? 0 : Math.atan2(M, y) * u;
						s < 0 && (s += 360), d < 0 && (d += 360);
						var g = d - s,
							m = Math.abs(d - s);
						m > 180 && d <= s ? (g += 360) : m > 180 && d > s && (g -= 360);
						var N = s + d;
						m <= 180 ? (N /= 2) : (N = (s + d < 360 ? N + 360 : N - 360) / 2);
						var F =
								1 -
								0.17 * Math.cos(e * (N - 30)) +
								0.24 * Math.cos(2 * e * N) +
								0.32 * Math.cos(e * (3 * N + 6)) -
								0.2 * Math.cos(e * (4 * N - 63)),
							L = n - o,
							I = x - v,
							P = 2 * Math.sin((e * g) / 2) * (v * x) ** 0.5,
							j = 1 + (0.015 * (i - 50) ** 2) / (20 + (i - 50) ** 2) ** 0.5,
							k = 1 + 0.045 * z,
							q = 1 + 0.015 * z * F,
							A = 30 * Math.exp(-1 * ((N - 275) / 25) ** 2),
							B = -2 * (l / (l + 25 ** 7)) ** 0.5 * Math.sin(2 * e * A);
						return (
							((L / 1 / j) ** 2 +
								(I / 1 / k) ** 2 +
								(P / 1 / q) ** 2 +
								(B * I * P) / (1 * k * 1 * q)) **
							0.5
						);
					})(this.toLab(), h.toLab()) / 100;
			return o(t(n, 3));
		}),
		r.object.push([i, 'lab']);
};
