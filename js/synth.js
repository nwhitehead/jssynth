
// Namespace
var Synth = {};

// Pitch calculations
Synth.pitch_of_midikey = function (key) {
    // A above middle C is 440 Hz
    // Middle C is midi key number 60
    return 8.1757989 * Math.pow(2.0, key / 12.0);
};

// "String" object
Synth.String = function () {
    this.events = [];
};

var pluck_filt = function (buf, len) {
    var i;
    for (i = 0; i < len; i++) {
        buf[i] = 0.8 * (2 * Math.random() - 1);
        // Alternative:
        // buf[i] = Math.random() - Math.random();
    }
};

var iir_filt = function (buf, len, B, gain) {
    /* Simple Karplus-Strong model, average signals with
       tiny bit of damping. */
    var j;
    var b0, b1;
    b1 = 0.5 * (1 - B);
    b0 = 1.0 - b1;
    for (j = 0; j < len - 1; j++) {
        buf[j] = gain * (b0 * buf[j] + b1 * buf[j + 1]);
    }
    buf[len - 1] = gain * (b0 * buf[len - 1] + b1 * buf[0]);
};

var damp_filt = function (buf, len) {
    var j;
    for (j = 0; j < len; j++) {
        buf[j] = 0.9 * buf[j];
    }
};

var frac_delay1 = function (buf, len, nu) {
    // Linear interpolation
    var i;
    for (i = 0; i < len - 1; i++) {
        buf[i] += nu * (buf[i + 1] - buf[i]);
    }
    buf[len - 1] += nu * (buf[0] - buf[len - 1]);
}

var frac_delay = function (buf, len, nu) {
    // Second-order Lagrangian interpolation
    // 0--1 input nu maps to 0.5--1.5 delay
    // (0.5 sample delay added for simplicity)
    var c0, c1, c2;
    nu += 0.5;
    c0 = 0.5 * (1 - nu) * (2 - nu);
    c1 = (2 - nu) * nu;
    c2 = 0.5 * (nu - 1) * nu;
    var i;
    for (i = 0; i < len - 2; i++) {
        buf[i] = c0 * buf[i] + c1 * buf[i + 1] + c2 * buf[i + 2];
    }
    buf[len - 2] = c0 * buf[len - 2] + c1 * buf[len - 1] + c2 * buf[0];
    buf[len - 1] = c0 * buf[len - 1] + c1 * buf[0] + c2 * buf[1];
};

Synth.String.prototype.init = function () {
    var i;
// Karplus-Strong
    this.sample = 0; // current sample position in buffer
    this.time = 0; // current absolute sample position
    this.buffer = new Float32Array(4096);
    this.damp = false;
    this.fret(60);
};

Synth.String.prototype.pluck = function () {
    var i;
    pluck_filt(this.buffer, this.period_i);
    for (i = 0; i < this.num_filt_pluck; i++) {
        iir_filt(this.buffer, this.period_i, this.brightness, this.gain);
    }
};

Synth.String.prototype.fret = function (key) {
    this.key = key;
    this.pitch = Synth.pitch_of_midikey(this.key); // Hz
    // 1.0 extra offset is 0.5 from LPF, 0.5 from Lagrangian interpolation
    this.num_filt_pluck = 1;
    this.num_filt = 1;
    this.period = 44100.0 / this.pitch + 0.5 + 0.5 * this.num_filt;
    while (this.sample > this.period) {
        this.sample -= this.period;
    }
    this.period_i = Math.ceil(this.period);
    this.t60 = 8.0; // time to decay to -60 db in seconds
    this.gain = Math.pow(0.001, 1.0 / (this.pitch * this.t60 * this.num_filt));
    this.brightness = 0.0;
};

Synth.String.prototype.sub_generate = function (buf, start, end) {
    var i, j;
    var p;
    var g;
    g = this.gain;
    p = this.sample;
    for (i = start; i < end; i++) {
        buf[i] += 0.5 * this.buffer[Math.floor(p)];
        p += 1;
        if (p >= this.period_i) {
            p -= this.period_i;
            frac_delay(this.buffer, this.period_i, this.period_i - this.period);
            for (j = 0; j < this.num_filt; j++) {
                iir_filt(this.buffer, this.period_i, this.brightness, this.gain);
            }
            if (this.damp) {
                damp_filt(this.buffer, this.period_i);
            }
        }
    }
    this.sample = p;
};

Synth.String.prototype.generate = function (buf, len) {
    var start, end;
    var i;
    var first_evt;
    start = 0;
    while (start < len) {
        end = len;
        first_evt = null;
        for(i = 0; i < this.events.length; i++) {
            var evt = this.events[i];
            if (evt.time < this.time + start) {
                // pass
            } else if (evt.time < this.time + end && evt.done === false) {
                first_evt = evt;
                end = evt.time - this.time;
            }
        }
        this.sub_generate(buf, start, end);
        if (first_evt) {
            if (first_evt.type == "pluck") {
                this.pluck();
                this.fret(first_evt.key);
            }
            if (first_evt.type == "damp") {
                this.damp = true;
            }
            if (first_evt.type == "undamp") {
                this.damp = false;
            }
            if (first_evt.type == "hammer") {
                this.fret(first_evt.key);
            }
            first_evt.done = true;
        }
        start = end;
    }
    this.time += len;
};

Synth.String.prototype.add_pluck = function (time, key) {
    this.events.push({type:"pluck", time:time, key:key, done:false});
};

Synth.String.prototype.add_damp = function (time) {
    this.events.push({type:"damp", time:time, done:false});
};

Synth.String.prototype.add_undamp = function (time) {
    this.events.push({type:"undamp", time:time, done:false});
};

Synth.String.prototype.add_hammer = function (time, key) {
    this.events.push({type:"hammer", time:time, key:key, done:false});
};

// "Song" object

Synth.Song = function () {
    this.bpm = 120;
    this.patterns = [];
};

Synth.Song.prototype.add_pattern = function (p) {
    this.patterns.push(p);
};

// "Guitar" object

Synth.Guitar = function () {
    var i;
    this.strings = [];
    this.end = 0; // end cursor, where to add new patterns
    this.time = 0; // current playing time
    this.beat_delay = 44100 / 60 * 60; // BUG * 1.001
    this.strum_delay = 6600;
    for(i = 0; i < 6; i++) {
        var string = new Synth.String();
        string.init();
        this.strings.push(string);
    }
    this.song = new Synth.Song();
    this.song.add_pattern(new Synth.Pattern([43, 47, 50, 55, 59, 67])); // G (I)
    this.song.add_pattern(new Synth.Pattern([40, 47, 52, 55, 59, 64])); // Em (vi)
    this.song.add_pattern(new Synth.Pattern([48, 48, 52, 55, 60, 64])); // C (IV)
    this.song.add_pattern(new Synth.Pattern([50, 45, 50, 57, 60, 66])); // D7 (V)
    this.syncSong();
};

Synth.Guitar.prototype.syncSong = function () {
    // Synch playlist of events to current song
    var i;
    for (i = 0; i < this.strings.length; i++) {
        this.strings[i].events = [];
    }
    this.end = 0;
    for (i = 0; i < this.song.patterns.length; i++) {
        this.add_pattern(this.song.patterns[i]);
    }
};


Synth.Guitar.prototype.generate = function (buf) {
    var i, j;
    // check if song repeating in this frame
    if (this.time + buf.length > this.end) {
        // write out ending bits
        for (i = 0; i < this.strings.length; i++) {
            this.strings[i].generate(buf, this.end - this.time);
        }
        var left = this.time + buf.length - this.end;
        this.time = 0;
        // reset all strings
        for (i = 0; i < this.strings.length; i++) {
            this.strings[i].time = 0;
        }
        this.syncSong();
        // now start up again in this frame!
        var newbuf = buf.subarray(buf.length - left);
        for (i = 0; i < this.strings.length; i++) {
            this.strings[i].generate(newbuf, left);
        }
        this.time = left;
    } else {
        for (i = 0; i < this.strings.length; i++) {
            this.strings[i].generate(buf, buf.length);
        }
        this.time += buf.length;
    }
};

Synth.Guitar.prototype.add_pattern = function (pat) {
    var i, j, string;
    var when, key;
    var start = this.end;
    for (i = 0; i < 6; i++) {
        string = this.strings[i];
        for (j = 0; j < pat.strum.length; j++) {
            d = pat.strum[j];
            when = start + 
                   d.beat * this.beat_delay + 
                   d.no * this.strum_delay;
            key = pat.keys[i];
            if (d.key == i + 1 && pat.keys[i] != 0) {
                if (key > 0) {
                    string.add_undamp(when - 1);
                    string.add_pluck(when, pat.keys[i]);
                } else {
                    string.add_damp(when - 1);
                    string.add_pluck(when, Math.abs(pat.keys[i]));
                }
            }
            if (d.key == -i - 1) {
                string.add_damp(when - 1);
            }
        }
    }
    this.end += pat.duration * this.beat_delay;
};

var simple_strum = function (beat, strum_offset) {
    var o = strum_offset;
    var b = beat;
    return  [
        {key: 1, beat:b, no:0*o},
        {key: 2, beat:b, no:1*o},
        {key: 3, beat:b, no:2*o},
        {key: 4, beat:b, no:3*o},
        {key: 5, beat:b, no:4*o},
        {key: 6, beat:b, no:5*o}]};

var all_damp = function (beat) {
    var b = beat - 0.0001;
    return  [
        {key: -1, beat:b, no:0},
        {key: -2, beat:b, no:0},
        {key: -3, beat:b, no:0},
        {key: -4, beat:b, no:0},
        {key: -5, beat:b, no:0},
        {key: -6, beat:b, no:0}]};

var picking = function (order, dur) {
    var res = [];
    var d = dur;
    var i;
    for (i = 0; i < order.length; i++) {
        res.push({key: order[i], beat:(d * i), no:0});
    }
    return res;
};

// "Pattern" object
Synth.Pattern = function (keys) {
    this.duration = 2;
    this.keys = keys;
    this.strum = [];
    this.strum = this.strum.concat(all_damp(0));
    this.strum = this.strum.concat(simple_strum(0, 1));
    //~ this.strum = this.strum.concat(picking([1, 4, 5, 6, 5, 4, 5, 4, 1, 4, 5, 6, 5, 4, 5, 4], 0.25));
};



// Playback function
Synth.startPlayback = function (callback) {
    /* Code based on Mozzila examples at:
       https://wiki.mozilla.org/Audio_Data_API
     */
    var audio = new Audio();
    audio.mozSetup(1, 44100);
    var currentWritePosition = 0;
    var prebufferSize = 22050 * 2;
    var tail = null, tailPosition;
    setInterval(function () {
        var written;
        if (tail) {
            written = audio.mozWriteAudio(tail.subarray(tailPosition));
            currentWritePosition += written;
            tailPosition += written;
            if (tailPosition < tail.length) {
                return;
            }
            tail = null;
        }
        var currentPosition = audio.mozCurrentSampleOffset();
        var available = currentPosition + prebufferSize - currentWritePosition;
        if (available > 0) {
            var soundData = new Float32Array(available);
            callback(soundData);
            written = audio.mozWriteAudio(soundData);
            if (written < soundData.length) {
                tail = soundData;
                tailPosition = written;
            }
            currentWritePosition += written;
        }
    }, 100);
};

// "Player" object
Synth.Player = function (guitar) {
    this.playing = false;
    this.guitar = guitar;
};

Synth.Player.prototype.init = function () {
    var that = this;
    Synth.startPlayback(function (buf) {
        if (that.playing) {
            that.guitar.generate(buf);
        }
    });
};

Synth.Player.prototype.play = function () {
    this.playing = true;
};

Synth.Player.prototype.pause = function () {
    this.playing = false;
};

Synth.Player.prototype.rewind = function () {
};
