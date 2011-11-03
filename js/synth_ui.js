/* Extend jQuery with simple sprite functions */

// Sprites
var Sprite = function (img, x, y, iw, ih) {
    this.elem = null;
};

var newSprite = function (img, x, y, iw, ih) {
    var $new = $('<div />');
    $new.data('w', iw);
    $new.data('h', ih);
    $new.css('width', iw + 'px').css('height', ih + 'px');
    $new.css('position', 'absolute').css('background-repeat', 'no-repeat');
    $new.css('background-image', 'url(' + img + ')');
    $new.moveTo(x, y);
    return $new;
};

jQuery.fn.setImage = function (ix, iy) {
    return this.css("backgroundPosition", (-ix) + "px " + (-iy) + "px");
};

jQuery.fn.moveTo = function (x, y) {
    return this.css("left", x + "px").css("top", y + "px");
};

// LEDs
var newLed = function (x, y, img) {
    return newSprite('../gfx/led-sprite-med.png', x, y, 24, 24).setLedImage(img);
};

jQuery.fn.setLedImage = function (img) {
    return this.setImage(0, 24 * img);
};

jQuery.fn.populateLeds = function (name, w, h, xpos, ypos, img) {
    var x, y;
    for (y = 0; y < h; y++) {
        for (x = 0; x < w; x++) {
            var $new = newLed(xpos + x * 24, ypos + y * 24, img);
            this.append($new);
            this.data(name + "x" + x + "y" + y, $new);
        }
    }
    return this;
};

jQuery.fn.getLed = function (name, x, y) {
    return this.data(name + "x" + x + "y" + y);
};

// Buttons
var newButton = function (x, y) {
    return newSprite('../gfx/shiny-small.png', x, y, 32, 32);
};

// 7 segment digits
var newDigit = function (x, y) {
    return newSprite('../gfx/7segment.png', x, y, 48, 60);
};

var newDigits = function (x, y, n) {
    var res = {};
    res.digits = [];
    var i;
    for (i = 0; i < n; i++) {
        res.digits.push(newDigit(x + 48 * i, y));
    }
    res.setDigits = function (v) {
        var i;
        for (i = 0; i < n; i++) {
            res.digits[n - i - 1].setDigitImage(v % 10);
            v = Math.floor(v / 10);
        }
    };
    res.elem = $('<div></div>');
    var i;
    for (i = 0; i < n; i++) {
        res.elem.append(res.digits[i]);
    }
    return res;
};

jQuery.fn.setDigitImage = function (digit) {
    var yy = Math.floor(digit / 4);
    var xx = digit - yy * 4;
    return this.setImage(xx * 48, yy * 60);
};

var newLabel = function (txt, ox, oy) {
    var $new = $('<div>' + txt + '</div>');
    $new.css('position', 'absolute');
    $new.css('left', ox + 'px');
    $new.css('top', oy + 'px');
    return $new;
};

jQuery.fn.periodic = function (func) {
    setInterval(func, 250);
};
