function qrImage(url){const mods={"./QR8bitByte":(module,exports,require)=>{var QRMode = require('./QRMode');

function QR8bitByte(data) {
	this.mode = QRMode.MODE_8BIT_BYTE;
	this.data = data;
}

QR8bitByte.prototype = {

	getLength : function() {
		return this.data.length;
	},
	
	write : function(buffer) {
		for (var i = 0; i < this.data.length; i++) {
			// not JIS ...
			buffer.put(this.data.charCodeAt(i), 8);
		}
	}
};

module.exports = QR8bitByte;
},"./QRBitBuffer":(module,exports,require)=>{function QRBitBuffer() {
	this.buffer = [];
	this.length = 0;
}

QRBitBuffer.prototype = {

	get : function(index) {
		var bufIndex = Math.floor(index / 8);
		return ( (this.buffer[bufIndex] >>> (7 - index % 8) ) & 1) == 1;
	},
	
	put : function(num, length) {
		for (var i = 0; i < length; i++) {
			this.putBit( ( (num >>> (length - i - 1) ) & 1) == 1);
		}
	},
	
	getLengthInBits : function() {
		return this.length;
	},
	
	putBit : function(bit) {
	
		var bufIndex = Math.floor(this.length / 8);
		if (this.buffer.length <= bufIndex) {
			this.buffer.push(0);
		}
	
		if (bit) {
			this.buffer[bufIndex] |= (0x80 >>> (this.length % 8) );
		}
	
		this.length++;
	}
};

module.exports = QRBitBuffer;
},"./QRErrorCorrectLevel":(module,exports,require)=>{module.exports = {
	L : 1,
	M : 0,
	Q : 3,
	H : 2
};

},"./QRMaskPattern":(module,exports,require)=>{module.exports = {
	PATTERN000 : 0,
	PATTERN001 : 1,
	PATTERN010 : 2,
	PATTERN011 : 3,
	PATTERN100 : 4,
	PATTERN101 : 5,
	PATTERN110 : 6,
	PATTERN111 : 7
};
},"./QRMath":(module,exports,require)=>{var QRMath = {

	glog : function(n) {
	
		if (n < 1) {
			throw new Error("glog(" + n + ")");
		}
		
		return QRMath.LOG_TABLE[n];
	},
	
	gexp : function(n) {
	
		while (n < 0) {
			n += 255;
		}
	
		while (n >= 256) {
			n -= 255;
		}
	
		return QRMath.EXP_TABLE[n];
	},
	
	EXP_TABLE : new Array(256),
	
	LOG_TABLE : new Array(256)

};
	
for (var i = 0; i < 8; i++) {
	QRMath.EXP_TABLE[i] = 1 << i;
}
for (var i = 8; i < 256; i++) {
	QRMath.EXP_TABLE[i] = QRMath.EXP_TABLE[i - 4]
		^ QRMath.EXP_TABLE[i - 5]
		^ QRMath.EXP_TABLE[i - 6]
		^ QRMath.EXP_TABLE[i - 8];
}
for (var i = 0; i < 255; i++) {
	QRMath.LOG_TABLE[QRMath.EXP_TABLE[i] ] = i;
}

module.exports = QRMath;
},"./QRMode":(module,exports,require)=>{module.exports = {
    MODE_NUMBER :       1 << 0,
    MODE_ALPHA_NUM :    1 << 1,
    MODE_8BIT_BYTE :    1 << 2,
    MODE_KANJI :        1 << 3
};
},"./QRPolynomial":(module,exports,require)=>{var QRMath = require('./QRMath');

function QRPolynomial(num, shift) {
	if (num.length === undefined) {
		throw new Error(num.length + "/" + shift);
	}

	var offset = 0;

	while (offset < num.length && num[offset] === 0) {
		offset++;
	}

	this.num = new Array(num.length - offset + shift);
	for (var i = 0; i < num.length - offset; i++) {
		this.num[i] = num[i + offset];
	}
}

QRPolynomial.prototype = {

	get : function(index) {
		return this.num[index];
	},
	
	getLength : function() {
		return this.num.length;
	},
	
	multiply : function(e) {
	
		var num = new Array(this.getLength() + e.getLength() - 1);
	
		for (var i = 0; i < this.getLength(); i++) {
			for (var j = 0; j < e.getLength(); j++) {
				num[i + j] ^= QRMath.gexp(QRMath.glog(this.get(i) ) + QRMath.glog(e.get(j) ) );
			}
		}
	
		return new QRPolynomial(num, 0);
	},
	
	mod : function(e) {
	
		if (this.getLength() - e.getLength() < 0) {
			return this;
		}
	
		var ratio = QRMath.glog(this.get(0) ) - QRMath.glog(e.get(0) );
	
		var num = new Array(this.getLength() );
		
		for (var i = 0; i < this.getLength(); i++) {
			num[i] = this.get(i);
		}
		
		for (var x = 0; x < e.getLength(); x++) {
			num[x] ^= QRMath.gexp(QRMath.glog(e.get(x) ) + ratio);
		}
	
		// recursive call
		return new QRPolynomial(num, 0).mod(e);
	}
};

module.exports = QRPolynomial;
},"./QRRSBlock":(module,exports,require)=>{var QRErrorCorrectLevel = require('./QRErrorCorrectLevel');

function QRRSBlock(totalCount, dataCount) {
	this.totalCount = totalCount;
	this.dataCount  = dataCount;
}

QRRSBlock.RS_BLOCK_TABLE = [

	// L
	// M
	// Q
	// H

	// 1
	[1, 26, 19],
	[1, 26, 16],
	[1, 26, 13],
	[1, 26, 9],
	
	// 2
	[1, 44, 34],
	[1, 44, 28],
	[1, 44, 22],
	[1, 44, 16],

	// 3
	[1, 70, 55],
	[1, 70, 44],
	[2, 35, 17],
	[2, 35, 13],

	// 4		
	[1, 100, 80],
	[2, 50, 32],
	[2, 50, 24],
	[4, 25, 9],
	
	// 5
	[1, 134, 108],
	[2, 67, 43],
	[2, 33, 15, 2, 34, 16],
	[2, 33, 11, 2, 34, 12],
	
	// 6
	[2, 86, 68],
	[4, 43, 27],
	[4, 43, 19],
	[4, 43, 15],
	
	// 7		
	[2, 98, 78],
	[4, 49, 31],
	[2, 32, 14, 4, 33, 15],
	[4, 39, 13, 1, 40, 14],
	
	// 8
	[2, 121, 97],
	[2, 60, 38, 2, 61, 39],
	[4, 40, 18, 2, 41, 19],
	[4, 40, 14, 2, 41, 15],
	
	// 9
	[2, 146, 116],
	[3, 58, 36, 2, 59, 37],
	[4, 36, 16, 4, 37, 17],
	[4, 36, 12, 4, 37, 13],
	
	// 10		
	[2, 86, 68, 2, 87, 69],
	[4, 69, 43, 1, 70, 44],
	[6, 43, 19, 2, 44, 20],
	[6, 43, 15, 2, 44, 16],

	// 11
	[4, 101, 81],
	[1, 80, 50, 4, 81, 51],
	[4, 50, 22, 4, 51, 23],
	[3, 36, 12, 8, 37, 13],

	// 12
	[2, 116, 92, 2, 117, 93],
	[6, 58, 36, 2, 59, 37],
	[4, 46, 20, 6, 47, 21],
	[7, 42, 14, 4, 43, 15],

	// 13
	[4, 133, 107],
	[8, 59, 37, 1, 60, 38],
	[8, 44, 20, 4, 45, 21],
	[12, 33, 11, 4, 34, 12],

	// 14
	[3, 145, 115, 1, 146, 116],
	[4, 64, 40, 5, 65, 41],
	[11, 36, 16, 5, 37, 17],
	[11, 36, 12, 5, 37, 13],

	// 15
	[5, 109, 87, 1, 110, 88],
	[5, 65, 41, 5, 66, 42],
	[5, 54, 24, 7, 55, 25],
	[11, 36, 12],

	// 16
	[5, 122, 98, 1, 123, 99],
	[7, 73, 45, 3, 74, 46],
	[15, 43, 19, 2, 44, 20],
	[3, 45, 15, 13, 46, 16],

	// 17
	[1, 135, 107, 5, 136, 108],
	[10, 74, 46, 1, 75, 47],
	[1, 50, 22, 15, 51, 23],
	[2, 42, 14, 17, 43, 15],

	// 18
	[5, 150, 120, 1, 151, 121],
	[9, 69, 43, 4, 70, 44],
	[17, 50, 22, 1, 51, 23],
	[2, 42, 14, 19, 43, 15],

	// 19
	[3, 141, 113, 4, 142, 114],
	[3, 70, 44, 11, 71, 45],
	[17, 47, 21, 4, 48, 22],
	[9, 39, 13, 16, 40, 14],

	// 20
	[3, 135, 107, 5, 136, 108],
	[3, 67, 41, 13, 68, 42],
	[15, 54, 24, 5, 55, 25],
	[15, 43, 15, 10, 44, 16],

	// 21
	[4, 144, 116, 4, 145, 117],
	[17, 68, 42],
	[17, 50, 22, 6, 51, 23],
	[19, 46, 16, 6, 47, 17],

	// 22
	[2, 139, 111, 7, 140, 112],
	[17, 74, 46],
	[7, 54, 24, 16, 55, 25],
	[34, 37, 13],

	// 23
	[4, 151, 121, 5, 152, 122],
	[4, 75, 47, 14, 76, 48],
	[11, 54, 24, 14, 55, 25],
	[16, 45, 15, 14, 46, 16],

	// 24
	[6, 147, 117, 4, 148, 118],
	[6, 73, 45, 14, 74, 46],
	[11, 54, 24, 16, 55, 25],
	[30, 46, 16, 2, 47, 17],

	// 25
	[8, 132, 106, 4, 133, 107],
	[8, 75, 47, 13, 76, 48],
	[7, 54, 24, 22, 55, 25],
	[22, 45, 15, 13, 46, 16],

	// 26
	[10, 142, 114, 2, 143, 115],
	[19, 74, 46, 4, 75, 47],
	[28, 50, 22, 6, 51, 23],
	[33, 46, 16, 4, 47, 17],

	// 27
	[8, 152, 122, 4, 153, 123],
	[22, 73, 45, 3, 74, 46],
	[8, 53, 23, 26, 54, 24],
	[12, 45, 15, 28, 46, 16],

	// 28
	[3, 147, 117, 10, 148, 118],
	[3, 73, 45, 23, 74, 46],
	[4, 54, 24, 31, 55, 25],
	[11, 45, 15, 31, 46, 16],

	// 29
	[7, 146, 116, 7, 147, 117],
	[21, 73, 45, 7, 74, 46],
	[1, 53, 23, 37, 54, 24],
	[19, 45, 15, 26, 46, 16],

	// 30
	[5, 145, 115, 10, 146, 116],
	[19, 75, 47, 10, 76, 48],
	[15, 54, 24, 25, 55, 25],
	[23, 45, 15, 25, 46, 16],

	// 31
	[13, 145, 115, 3, 146, 116],
	[2, 74, 46, 29, 75, 47],
	[42, 54, 24, 1, 55, 25],
	[23, 45, 15, 28, 46, 16],

	// 32
	[17, 145, 115],
	[10, 74, 46, 23, 75, 47],
	[10, 54, 24, 35, 55, 25],
	[19, 45, 15, 35, 46, 16],

	// 33
	[17, 145, 115, 1, 146, 116],
	[14, 74, 46, 21, 75, 47],
	[29, 54, 24, 19, 55, 25],
	[11, 45, 15, 46, 46, 16],

	// 34
	[13, 145, 115, 6, 146, 116],
	[14, 74, 46, 23, 75, 47],
	[44, 54, 24, 7, 55, 25],
	[59, 46, 16, 1, 47, 17],

	// 35
	[12, 151, 121, 7, 152, 122],
	[12, 75, 47, 26, 76, 48],
	[39, 54, 24, 14, 55, 25],
	[22, 45, 15, 41, 46, 16],

	// 36
	[6, 151, 121, 14, 152, 122],
	[6, 75, 47, 34, 76, 48],
	[46, 54, 24, 10, 55, 25],
	[2, 45, 15, 64, 46, 16],

	// 37
	[17, 152, 122, 4, 153, 123],
	[29, 74, 46, 14, 75, 47],
	[49, 54, 24, 10, 55, 25],
	[24, 45, 15, 46, 46, 16],

	// 38
	[4, 152, 122, 18, 153, 123],
	[13, 74, 46, 32, 75, 47],
	[48, 54, 24, 14, 55, 25],
	[42, 45, 15, 32, 46, 16],

	// 39
	[20, 147, 117, 4, 148, 118],
	[40, 75, 47, 7, 76, 48],
	[43, 54, 24, 22, 55, 25],
	[10, 45, 15, 67, 46, 16],

	// 40
	[19, 148, 118, 6, 149, 119],
	[18, 75, 47, 31, 76, 48],
	[34, 54, 24, 34, 55, 25],
	[20, 45, 15, 61, 46, 16]
];

QRRSBlock.getRSBlocks = function(typeNumber, errorCorrectLevel) {
	
	var rsBlock = QRRSBlock.getRsBlockTable(typeNumber, errorCorrectLevel);
	
	if (rsBlock === undefined) {
		throw new Error("bad rs block @ typeNumber:" + typeNumber + "/errorCorrectLevel:" + errorCorrectLevel);
	}

	var length = rsBlock.length / 3;
	
	var list = [];
	
	for (var i = 0; i < length; i++) {

		var count = rsBlock[i * 3 + 0];
		var totalCount = rsBlock[i * 3 + 1];
		var dataCount  = rsBlock[i * 3 + 2];

		for (var j = 0; j < count; j++) {
			list.push(new QRRSBlock(totalCount, dataCount) );	
		}
	}
	
	return list;
};

QRRSBlock.getRsBlockTable = function(typeNumber, errorCorrectLevel) {

	switch(errorCorrectLevel) {
	case QRErrorCorrectLevel.L :
		return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 0];
	case QRErrorCorrectLevel.M :
		return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 1];
	case QRErrorCorrectLevel.Q :
		return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 2];
	case QRErrorCorrectLevel.H :
		return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 3];
	default :
		return undefined;
	}
};

module.exports = QRRSBlock;
},"./QRUtil":(module,exports,require)=>{var QRMode = require('./QRMode');
var QRPolynomial = require('./QRPolynomial');
var QRMath = require('./QRMath');
var QRMaskPattern = require('./QRMaskPattern');

var QRUtil = {

    PATTERN_POSITION_TABLE : [
        [],
        [6, 18],
        [6, 22],
        [6, 26],
        [6, 30],
        [6, 34],
        [6, 22, 38],
        [6, 24, 42],
        [6, 26, 46],
        [6, 28, 50],
        [6, 30, 54],        
        [6, 32, 58],
        [6, 34, 62],
        [6, 26, 46, 66],
        [6, 26, 48, 70],
        [6, 26, 50, 74],
        [6, 30, 54, 78],
        [6, 30, 56, 82],
        [6, 30, 58, 86],
        [6, 34, 62, 90],
        [6, 28, 50, 72, 94],
        [6, 26, 50, 74, 98],
        [6, 30, 54, 78, 102],
        [6, 28, 54, 80, 106],
        [6, 32, 58, 84, 110],
        [6, 30, 58, 86, 114],
        [6, 34, 62, 90, 118],
        [6, 26, 50, 74, 98, 122],
        [6, 30, 54, 78, 102, 126],
        [6, 26, 52, 78, 104, 130],
        [6, 30, 56, 82, 108, 134],
        [6, 34, 60, 86, 112, 138],
        [6, 30, 58, 86, 114, 142],
        [6, 34, 62, 90, 118, 146],
        [6, 30, 54, 78, 102, 126, 150],
        [6, 24, 50, 76, 102, 128, 154],
        [6, 28, 54, 80, 106, 132, 158],
        [6, 32, 58, 84, 110, 136, 162],
        [6, 26, 54, 82, 110, 138, 166],
        [6, 30, 58, 86, 114, 142, 170]
    ],

    G15 : (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0),
    G18 : (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0),
    G15_MASK : (1 << 14) | (1 << 12) | (1 << 10)    | (1 << 4) | (1 << 1),

    getBCHTypeInfo : function(data) {
        var d = data << 10;
        while (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G15) >= 0) {
            d ^= (QRUtil.G15 << (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G15) ) );    
        }
        return ( (data << 10) | d) ^ QRUtil.G15_MASK;
    },

    getBCHTypeNumber : function(data) {
        var d = data << 12;
        while (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G18) >= 0) {
            d ^= (QRUtil.G18 << (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G18) ) );    
        }
        return (data << 12) | d;
    },

    getBCHDigit : function(data) {

        var digit = 0;

        while (data !== 0) {
            digit++;
            data >>>= 1;
        }

        return digit;
    },

    getPatternPosition : function(typeNumber) {
        return QRUtil.PATTERN_POSITION_TABLE[typeNumber - 1];
    },

    getMask : function(maskPattern, i, j) {
        
        switch (maskPattern) {
            
        case QRMaskPattern.PATTERN000 : return (i + j) % 2 === 0;
        case QRMaskPattern.PATTERN001 : return i % 2 === 0;
        case QRMaskPattern.PATTERN010 : return j % 3 === 0;
        case QRMaskPattern.PATTERN011 : return (i + j) % 3 === 0;
        case QRMaskPattern.PATTERN100 : return (Math.floor(i / 2) + Math.floor(j / 3) ) % 2 === 0;
        case QRMaskPattern.PATTERN101 : return (i * j) % 2 + (i * j) % 3 === 0;
        case QRMaskPattern.PATTERN110 : return ( (i * j) % 2 + (i * j) % 3) % 2 === 0;
        case QRMaskPattern.PATTERN111 : return ( (i * j) % 3 + (i + j) % 2) % 2 === 0;

        default :
            throw new Error("bad maskPattern:" + maskPattern);
        }
    },

    getErrorCorrectPolynomial : function(errorCorrectLength) {

        var a = new QRPolynomial([1], 0);

        for (var i = 0; i < errorCorrectLength; i++) {
            a = a.multiply(new QRPolynomial([1, QRMath.gexp(i)], 0) );
        }

        return a;
    },

    getLengthInBits : function(mode, type) {

        if (1 <= type && type < 10) {

            // 1 - 9

            switch(mode) {
            case QRMode.MODE_NUMBER     : return 10;
            case QRMode.MODE_ALPHA_NUM  : return 9;
            case QRMode.MODE_8BIT_BYTE  : return 8;
            case QRMode.MODE_KANJI      : return 8;
            default :
                throw new Error("mode:" + mode);
            }

        } else if (type < 27) {

            // 10 - 26

            switch(mode) {
            case QRMode.MODE_NUMBER     : return 12;
            case QRMode.MODE_ALPHA_NUM  : return 11;
            case QRMode.MODE_8BIT_BYTE  : return 16;
            case QRMode.MODE_KANJI      : return 10;
            default :
                throw new Error("mode:" + mode);
            }

        } else if (type < 41) {

            // 27 - 40

            switch(mode) {
            case QRMode.MODE_NUMBER     : return 14;
            case QRMode.MODE_ALPHA_NUM  : return 13;
            case QRMode.MODE_8BIT_BYTE  : return 16;
            case QRMode.MODE_KANJI      : return 12;
            default :
                throw new Error("mode:" + mode);
            }

        } else {
            throw new Error("type:" + type);
        }
    },

    getLostPoint : function(qrCode) {
        
        var moduleCount = qrCode.getModuleCount();
        var lostPoint = 0;
        var row = 0; 
        var col = 0;

        
        // LEVEL1
        
        for (row = 0; row < moduleCount; row++) {

            for (col = 0; col < moduleCount; col++) {

                var sameCount = 0;
                var dark = qrCode.isDark(row, col);

                for (var r = -1; r <= 1; r++) {

                    if (row + r < 0 || moduleCount <= row + r) {
                        continue;
                    }

                    for (var c = -1; c <= 1; c++) {

                        if (col + c < 0 || moduleCount <= col + c) {
                            continue;
                        }

                        if (r === 0 && c === 0) {
                            continue;
                        }

                        if (dark === qrCode.isDark(row + r, col + c) ) {
                            sameCount++;
                        }
                    }
                }

                if (sameCount > 5) {
                    lostPoint += (3 + sameCount - 5);
                }
            }
        }

        // LEVEL2

        for (row = 0; row < moduleCount - 1; row++) {
            for (col = 0; col < moduleCount - 1; col++) {
                var count = 0;
                if (qrCode.isDark(row,     col    ) ) count++;
                if (qrCode.isDark(row + 1, col    ) ) count++;
                if (qrCode.isDark(row,     col + 1) ) count++;
                if (qrCode.isDark(row + 1, col + 1) ) count++;
                if (count === 0 || count === 4) {
                    lostPoint += 3;
                }
            }
        }

        // LEVEL3

        for (row = 0; row < moduleCount; row++) {
            for (col = 0; col < moduleCount - 6; col++) {
                if (qrCode.isDark(row, col) && 
                        !qrCode.isDark(row, col + 1) && 
                         qrCode.isDark(row, col + 2) && 
                         qrCode.isDark(row, col + 3) && 
                         qrCode.isDark(row, col + 4) && 
                        !qrCode.isDark(row, col + 5) && 
                         qrCode.isDark(row, col + 6) ) {
                    lostPoint += 40;
                }
            }
        }

        for (col = 0; col < moduleCount; col++) {
            for (row = 0; row < moduleCount - 6; row++) {
                if (qrCode.isDark(row, col) &&
                        !qrCode.isDark(row + 1, col) &&
                         qrCode.isDark(row + 2, col) &&
                         qrCode.isDark(row + 3, col) &&
                         qrCode.isDark(row + 4, col) &&
                        !qrCode.isDark(row + 5, col) &&
                         qrCode.isDark(row + 6, col) ) {
                    lostPoint += 40;
                }
            }
        }

        // LEVEL4
        
        var darkCount = 0;

        for (col = 0; col < moduleCount; col++) {
            for (row = 0; row < moduleCount; row++) {
                if (qrCode.isDark(row, col) ) {
                    darkCount++;
                }
            }
        }
        
        var ratio = Math.abs(100 * darkCount / moduleCount / moduleCount - 50) / 5;
        lostPoint += ratio * 10;

        return lostPoint;       
    }

};

module.exports = QRUtil;
},"./index":(module,exports,require)=>{//---------------------------------------------------------------------
// QRCode for JavaScript
//
// Copyright (c) 2009 Kazuhiko Arase
//
// URL: http://www.d-project.com/
//
// Licensed under the MIT license:
//   http://www.opensource.org/licenses/mit-license.php
//
// The word "QR Code" is registered trademark of 
// DENSO WAVE INCORPORATED
//   http://www.denso-wave.com/qrcode/faqpatent-e.html
//
//---------------------------------------------------------------------
// Modified to work in node for this project (and some refactoring)
//---------------------------------------------------------------------

var QR8bitByte = require('./QR8bitByte');
var QRUtil = require('./QRUtil');
var QRPolynomial = require('./QRPolynomial');
var QRRSBlock = require('./QRRSBlock');
var QRBitBuffer = require('./QRBitBuffer');

function QRCode(typeNumber, errorCorrectLevel) {
	this.typeNumber = typeNumber;
	this.errorCorrectLevel = errorCorrectLevel;
	this.modules = null;
	this.moduleCount = 0;
	this.dataCache = null;
	this.dataList = [];
}

QRCode.prototype = {
	
	addData : function(data) {
		var newData = new QR8bitByte(data);
		this.dataList.push(newData);
		this.dataCache = null;
	},
	
	isDark : function(row, col) {
		if (row < 0 || this.moduleCount <= row || col < 0 || this.moduleCount <= col) {
			throw new Error(row + "," + col);
		}
		return this.modules[row][col];
	},

	getModuleCount : function() {
		return this.moduleCount;
	},
	
	make : function() {
		// Calculate automatically typeNumber if provided is < 1
		if (this.typeNumber < 1 ){
			var typeNumber = 1;
			for (typeNumber = 1; typeNumber < 40; typeNumber++) {
				var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, this.errorCorrectLevel);

				var buffer = new QRBitBuffer();
				var totalDataCount = 0;
				for (var i = 0; i < rsBlocks.length; i++) {
					totalDataCount += rsBlocks[i].dataCount;
				}

				for (var x = 0; x < this.dataList.length; x++) {
					var data = this.dataList[x];
					buffer.put(data.mode, 4);
					buffer.put(data.getLength(), QRUtil.getLengthInBits(data.mode, typeNumber) );
					data.write(buffer);
				}
				if (buffer.getLengthInBits() <= totalDataCount * 8)
					break;
			}
			this.typeNumber = typeNumber;
		}
		this.makeImpl(false, this.getBestMaskPattern() );
	},
	
	makeImpl : function(test, maskPattern) {
		
		this.moduleCount = this.typeNumber * 4 + 17;
		this.modules = new Array(this.moduleCount);
		
		for (var row = 0; row < this.moduleCount; row++) {
			
			this.modules[row] = new Array(this.moduleCount);
			
			for (var col = 0; col < this.moduleCount; col++) {
				this.modules[row][col] = null;//(col + row) % 3;
			}
		}
	
		this.setupPositionProbePattern(0, 0);
		this.setupPositionProbePattern(this.moduleCount - 7, 0);
		this.setupPositionProbePattern(0, this.moduleCount - 7);
		this.setupPositionAdjustPattern();
		this.setupTimingPattern();
		this.setupTypeInfo(test, maskPattern);
		
		if (this.typeNumber >= 7) {
			this.setupTypeNumber(test);
		}
	
		if (this.dataCache === null) {
			this.dataCache = QRCode.createData(this.typeNumber, this.errorCorrectLevel, this.dataList);
		}
	
		this.mapData(this.dataCache, maskPattern);
	},

	setupPositionProbePattern : function(row, col)  {
		
		for (var r = -1; r <= 7; r++) {
			
			if (row + r <= -1 || this.moduleCount <= row + r) continue;
			
			for (var c = -1; c <= 7; c++) {
				
				if (col + c <= -1 || this.moduleCount <= col + c) continue;
				
				if ( (0 <= r && r <= 6 && (c === 0 || c === 6) ) || 
                     (0 <= c && c <= 6 && (r === 0 || r === 6) ) || 
                     (2 <= r && r <= 4 && 2 <= c && c <= 4) ) {
					this.modules[row + r][col + c] = true;
				} else {
					this.modules[row + r][col + c] = false;
				}
			}		
		}		
	},
	
	getBestMaskPattern : function() {
	
		var minLostPoint = 0;
		var pattern = 0;
	
		for (var i = 0; i < 8; i++) {
			
			this.makeImpl(true, i);
	
			var lostPoint = QRUtil.getLostPoint(this);
	
			if (i === 0 || minLostPoint >  lostPoint) {
				minLostPoint = lostPoint;
				pattern = i;
			}
		}
	
		return pattern;
	},
	
	createMovieClip : function(target_mc, instance_name, depth) {
	
		var qr_mc = target_mc.createEmptyMovieClip(instance_name, depth);
		var cs = 1;
	
		this.make();

		for (var row = 0; row < this.modules.length; row++) {
			
			var y = row * cs;
			
			for (var col = 0; col < this.modules[row].length; col++) {
	
				var x = col * cs;
				var dark = this.modules[row][col];
			
				if (dark) {
					qr_mc.beginFill(0, 100);
					qr_mc.moveTo(x, y);
					qr_mc.lineTo(x + cs, y);
					qr_mc.lineTo(x + cs, y + cs);
					qr_mc.lineTo(x, y + cs);
					qr_mc.endFill();
				}
			}
		}
		
		return qr_mc;
	},

	setupTimingPattern : function() {
		
		for (var r = 8; r < this.moduleCount - 8; r++) {
			if (this.modules[r][6] !== null) {
				continue;
			}
			this.modules[r][6] = (r % 2 === 0);
		}
	
		for (var c = 8; c < this.moduleCount - 8; c++) {
			if (this.modules[6][c] !== null) {
				continue;
			}
			this.modules[6][c] = (c % 2 === 0);
		}
	},
	
	setupPositionAdjustPattern : function() {
	
		var pos = QRUtil.getPatternPosition(this.typeNumber);
		
		for (var i = 0; i < pos.length; i++) {
		
			for (var j = 0; j < pos.length; j++) {
			
				var row = pos[i];
				var col = pos[j];
				
				if (this.modules[row][col] !== null) {
					continue;
				}
				
				for (var r = -2; r <= 2; r++) {
				
					for (var c = -2; c <= 2; c++) {
					
						if (Math.abs(r) === 2 || 
                            Math.abs(c) === 2 ||
                            (r === 0 && c === 0) ) {
							this.modules[row + r][col + c] = true;
						} else {
							this.modules[row + r][col + c] = false;
						}
					}
				}
			}
		}
	},
	
	setupTypeNumber : function(test) {
	
		var bits = QRUtil.getBCHTypeNumber(this.typeNumber);
        var mod;
	
		for (var i = 0; i < 18; i++) {
			mod = (!test && ( (bits >> i) & 1) === 1);
			this.modules[Math.floor(i / 3)][i % 3 + this.moduleCount - 8 - 3] = mod;
		}
	
		for (var x = 0; x < 18; x++) {
			mod = (!test && ( (bits >> x) & 1) === 1);
			this.modules[x % 3 + this.moduleCount - 8 - 3][Math.floor(x / 3)] = mod;
		}
	},
	
	setupTypeInfo : function(test, maskPattern) {
	
		var data = (this.errorCorrectLevel << 3) | maskPattern;
		var bits = QRUtil.getBCHTypeInfo(data);
        var mod;
	
		// vertical		
		for (var v = 0; v < 15; v++) {
	
			mod = (!test && ( (bits >> v) & 1) === 1);
	
			if (v < 6) {
				this.modules[v][8] = mod;
			} else if (v < 8) {
				this.modules[v + 1][8] = mod;
			} else {
				this.modules[this.moduleCount - 15 + v][8] = mod;
			}
		}
	
		// horizontal
		for (var h = 0; h < 15; h++) {
	
			mod = (!test && ( (bits >> h) & 1) === 1);
			
			if (h < 8) {
				this.modules[8][this.moduleCount - h - 1] = mod;
			} else if (h < 9) {
				this.modules[8][15 - h - 1 + 1] = mod;
			} else {
				this.modules[8][15 - h - 1] = mod;
			}
		}
	
		// fixed module
		this.modules[this.moduleCount - 8][8] = (!test);
	
	},
	
	mapData : function(data, maskPattern) {
		
		var inc = -1;
		var row = this.moduleCount - 1;
		var bitIndex = 7;
		var byteIndex = 0;
		
		for (var col = this.moduleCount - 1; col > 0; col -= 2) {
	
			if (col === 6) col--;
	
			while (true) {
	
				for (var c = 0; c < 2; c++) {
					
					if (this.modules[row][col - c] === null) {
						
						var dark = false;
	
						if (byteIndex < data.length) {
							dark = ( ( (data[byteIndex] >>> bitIndex) & 1) === 1);
						}
	
						var mask = QRUtil.getMask(maskPattern, row, col - c);
	
						if (mask) {
							dark = !dark;
						}
						
						this.modules[row][col - c] = dark;
						bitIndex--;
	
						if (bitIndex === -1) {
							byteIndex++;
							bitIndex = 7;
						}
					}
				}
								
				row += inc;
	
				if (row < 0 || this.moduleCount <= row) {
					row -= inc;
					inc = -inc;
					break;
				}
			}
		}
		
	}

};

QRCode.PAD0 = 0xEC;
QRCode.PAD1 = 0x11;

QRCode.createData = function(typeNumber, errorCorrectLevel, dataList) {
	
	var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, errorCorrectLevel);
	
	var buffer = new QRBitBuffer();
	
	for (var i = 0; i < dataList.length; i++) {
		var data = dataList[i];
		buffer.put(data.mode, 4);
		buffer.put(data.getLength(), QRUtil.getLengthInBits(data.mode, typeNumber) );
		data.write(buffer);
	}

	// calc num max data.
	var totalDataCount = 0;
	for (var x = 0; x < rsBlocks.length; x++) {
		totalDataCount += rsBlocks[x].dataCount;
	}

	if (buffer.getLengthInBits() > totalDataCount * 8) {
		throw new Error("code length overflow. (" + 
            buffer.getLengthInBits() + 
            ">" +  
            totalDataCount * 8 + 
            ")");
	}

	// end code
	if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) {
		buffer.put(0, 4);
	}

	// padding
	while (buffer.getLengthInBits() % 8 !== 0) {
		buffer.putBit(false);
	}

	// padding
	while (true) {
		
		if (buffer.getLengthInBits() >= totalDataCount * 8) {
			break;
		}
		buffer.put(QRCode.PAD0, 8);
		
		if (buffer.getLengthInBits() >= totalDataCount * 8) {
			break;
		}
		buffer.put(QRCode.PAD1, 8);
	}

	return QRCode.createBytes(buffer, rsBlocks);
};

QRCode.createBytes = function(buffer, rsBlocks) {

	var offset = 0;
	
	var maxDcCount = 0;
	var maxEcCount = 0;
	
	var dcdata = new Array(rsBlocks.length);
	var ecdata = new Array(rsBlocks.length);
	
	for (var r = 0; r < rsBlocks.length; r++) {

		var dcCount = rsBlocks[r].dataCount;
		var ecCount = rsBlocks[r].totalCount - dcCount;

		maxDcCount = Math.max(maxDcCount, dcCount);
		maxEcCount = Math.max(maxEcCount, ecCount);
		
		dcdata[r] = new Array(dcCount);
		
		for (var i = 0; i < dcdata[r].length; i++) {
			dcdata[r][i] = 0xff & buffer.buffer[i + offset];
		}
		offset += dcCount;
		
		var rsPoly = QRUtil.getErrorCorrectPolynomial(ecCount);
		var rawPoly = new QRPolynomial(dcdata[r], rsPoly.getLength() - 1);

		var modPoly = rawPoly.mod(rsPoly);
		ecdata[r] = new Array(rsPoly.getLength() - 1);
		for (var x = 0; x < ecdata[r].length; x++) {
            var modIndex = x + modPoly.getLength() - ecdata[r].length;
			ecdata[r][x] = (modIndex >= 0)? modPoly.get(modIndex) : 0;
		}

	}
	
	var totalCodeCount = 0;
	for (var y = 0; y < rsBlocks.length; y++) {
		totalCodeCount += rsBlocks[y].totalCount;
	}

	var data = new Array(totalCodeCount);
	var index = 0;

	for (var z = 0; z < maxDcCount; z++) {
		for (var s = 0; s < rsBlocks.length; s++) {
			if (z < dcdata[s].length) {
				data[index++] = dcdata[s][z];
			}
		}
	}

	for (var xx = 0; xx < maxEcCount; xx++) {
		for (var t = 0; t < rsBlocks.length; t++) {
			if (xx < ecdata[t].length) {
				data[index++] = ecdata[t][xx];
			}
		}
	}

	return data;

};

module.exports = QRCode;
}},cache={};function req(k){if(!cache[k]){const m={exports:{}};cache[k]=m;mods[k](m,m.exports,req)}return cache[k].exports}const Q=req('./index'),q=new Q(-1,1);q.addData(url);q.make();const n=q.getModuleCount(),dots=[];for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(q.isDark(y,x))dots.push('M'+(x+4)+' '+(y+4)+'h1v1h-1z');return 'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+(n+8)+' '+(n+8)+'" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="white"/><path d="'+dots.join('')+'"/></svg>');}
'use strict';
(() => {
const snapshot=fetch('./catalog.json').then(r=>{if(!r.ok)throw Error('资料目录加载失败，请刷新重试。');return r.json()}); let files={};
const $ = (s, p=document) => p.querySelector(s);
const main = $('#main'), path = ('/resources/'+(new URLSearchParams(location.search).get('r')||'')).replace(/\/$/,'');
const escape = x => String(x ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const enc = encodeURIComponent, detailUrl = id => '?r='+enc(id);
const qs = new URLSearchParams(location.search);
const formatDate = time => {
  if (!time) return '未填写';
  const d = new Date(typeof time==='number' && time<1e12 ? time*1000 : time);
  return Number.isNaN(+d) ? String(time) : new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(d).replaceAll('/','.');
};
const size = n => n>=1048576 ? (n/1048576).toFixed(1)+' MB' : Math.ceil(n/1024)+' KB';
const stateName = {approved_sale:'出售审核通过（待开放交易）',published:'已发布',pending:'待审核',returned:'需补充',withdrawn:'已撤回',archived:'已归档',draft:'草稿'};
const feedbackStates=['待处理','核对中','已修订','暂不修改','信息不足'];
const guideLink='<a href="?r=about">使用说明 ↗</a>';
const back='<a class="backlink" href="./">← 返回资料库</a>';
const paramsToObject=form=>Object.fromEntries(new FormData(form));
let catalog,settings={},adminData;
function trustedURL(raw){try{const u=new URL(raw,location.href);return ['http:','https:'].includes(u.protocol)?escape(u.href):'';}catch{return '';}}
function selected(value,current){return String(value)===String(current)?' selected':'';}
function options(list,current){return list.map(i=>'<option'+selected(i,current)+'>'+escape(i)+'</option>').join('');}
function btn(label,attrs='',primary=false){return '<button class="btn '+(primary?'primary':'')+'" '+attrs+'>'+label+'</button>';}
function lead(title,desc){document.title=title+' · 小博土期末资料库';return back+'<header class="page-intro"><h1>'+escape(title)+'</h1><p>'+escape(desc)+'</p></header>';}
function field(label,name,value='',required=false,type='text',extra=''){
  const safe=escape(value), req=required?' required':'',title=escape(label)+(required?' <small>必填</small>':'');
  return '<label class="field"><span>'+title+'</span>'+(type==='textarea'?'<textarea rows="3" name="'+name+'"'+req+' '+extra+'>'+safe+'</textarea>':'<input type="'+type+'" name="'+name+'" value="'+safe+'"'+req+' '+extra+'>')+'</label>';
}
function choice(label,name,values,current){return '<label class="field"><span>'+escape(label)+'</span><select name="'+name+'">'+options(values,current)+'</select></label>';}
function msg(form,text){let node=$('[role=status]',form);if(node)node.textContent=text;}
function statusBox(){return '<p class="form-status" role="status"></p>';}
async function api(url, opt={}){
  if(!opt.method){const data=await snapshot; if(url==="/api/catalog")return data.catalog; if(url.startsWith("/api/resource/") && data.details[url.slice(14)])return data.details[url.slice(14)];} throw Object.assign(Error("此资料当前不可用。"),{status:404}); /* const res=await fetch(url,{cache:'no-store',...opt});let data;
  try{data=await res.json();}catch{throw Error('暂时无法读取服务器响应，请重试。');}
  if(!res.ok)throw Object.assign(Error(data.error||'请求失败，请重试。'),{status:res.status});
  return data; */
}
const post=(u,data)=>api(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
const iconSearch='<svg aria-hidden="true" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>';
function errorPage(error){
  const denied=error.status===401||error.status===403,missing=error.status===404;
  main.innerHTML=back+'<section class="panel notice"><h1>'+(denied?'需要管理员权限':missing?'资料暂不可用':'暂时无法加载')+'</h1><p>'+escape(error.message)+'</p>'+(denied?'<a class="btn primary" href="/signin-with-chatgpt?return_to=%2Fadmin" target="_top">管理员登录</a>':btn('重新加载','id="retry"'))+'</section>';
  $('#retry')?.addEventListener('click',()=>location.reload());
}
const formatsOf=r=>String(r.formats||'').split(/[,，、]/).map(i=>i.trim().toUpperCase()).filter(Boolean);
function cover(r){
  const drill=/练习|刷题|模拟|题库/.test(String(r.kind)+String(r.title))&&!/逐章精讲/.test(r.title);
  const short=/习概|习思想|习近平/.test(r.subject)?'习概':String(r.subject||'笔记').slice(0,4);
  return '<div class="cover'+(drill?' drill':'')+'" aria-hidden="true"><small>'+escape(r.kind||'学习资料')+'</small><b>'+escape(short)+'</b><i>'+escape(r.label||'')+'</i></div>';
}
function card(r){
 return '<article class="card"><a class="card-link" href="'+detailUrl(r.id)+'">'+cover(r)+'<div class="cardbody"><div class="meta">'+escape([r.subject,r.year].filter(Boolean).join(' · '))+'</div><h3>'+escape(r.title)+'</h3><p>'+escape(r.summary||'')+'</p><div class="card-tags">'+[r.kind,...formatsOf(r),r.checkStatus||'待说明'].filter(Boolean).map(t=>'<span class="tag">'+escape(t)+'</span>').join('')+'</div><div class="card-foot"><small>'+escape(formatDate(r.updated))+(r.label?' · '+escape(r.label):'')+'</small><b aria-hidden="true">↗</b></div></div></a></article>';
}
const archiveNotice='本批资料由川北医学院2024级同学整理，仅供学习参考。教材、授课重点和考试要求可能因学期而异，请以本学期教材和任课老师通知为准。';
function catalogHome(){
 const all=catalog.items||[],facet=(key)=>[...new Set(all.flatMap(r=>key==='formats'?formatsOf(r):[r[key]]).filter(Boolean))].sort();
 const filter=(label,key,values)=>'<label class="filter-control"><span>'+label+'</span><select name="'+key+'" aria-label="'+label+'"><option value="">全部'+label+'</option>'+options(values,qs.get(key))+'</select></label>';
 document.title='期末资料库 · 小博土';
 main.innerHTML='<section class="hero"><div class="hero-copy"><div class="kicker">学习资料 <span>/</span> STUDY LIBRARY</div><h1>期末资料库</h1><p>'+escape(settings.intro||'小博土整理的复习讲义、章节练习与模拟卷。按科目查找，查看版本后免费下载。')+'</p><div class="hero-note"><span class="dot"></span> 当前公开资料免费 <span>·</span> 自愿支持</div><a class="guest-jump" href="#topicPoll">给小博土留言 ↗</a></div>'+$('#hero-art').innerHTML+'</section>'+(settings.announcement?'<p class="notice">'+escape(settings.announcement)+'</p>':'')+'<section id="library"><div class="section-head"><div><div class="kicker">RESOURCE INDEX</div><h2>资料目录</h2></div><span class="count" id="total"></span></div><form id="filterForm" class="toolbar"><label class="search">'+iconSearch+'<input type="search" name="q" aria-label="搜索资料" placeholder="搜索标题、科目、标签或简介" value="'+escape(qs.get('q'))+'"></label><div class="filterbar filters">'+filter('科目','subject',facet('subject'))+filter('学年','year',facet('year'))+filter('类型','kind',facet('kind'))+filter('格式','formats',facet('formats'))+'<button class="text-btn" type="reset">清除筛选</button></div></form><div class="list-caption"><span>最近更新</span><span id="lastUpdate"></span></div><div id="results"></div></section><div class="guide"><div><strong>有资料想分享？</strong><p>上传你的复习笔记，审核后收录到资料库。</p></div><a class="btn" href="https://xiaobotu-study-library.gx2jwkwhpv.chatgpt.site/resources/submit">提交资料 ↗</a></div>';
 main.insertAdjacentHTML('beforeend','<section class="panel" id="topicPoll"></section>'+fallbackLink());$('#topicPoll').innerHTML='<h2>给小博土留言</h2><p>匿名留言、点赞、私人反馈和下一份资料建议，在原站提交并审核。</p><a class="btn" href="https://xiaobotu-study-library.gx2jwkwhpv.chatgpt.site/resources#topicPoll">打开原站留言 ↗</a>';
 const form=$('#filterForm');
 function refresh(update=false){
  if(update){
    for(const [key,value] of new FormData(form)){if(value)qs.set(key,value);else qs.delete(key);}
    qs.delete('page');history.replaceState(null,'',location.pathname+(qs.size?'?'+qs:''));
  }
  const q=(qs.get('q')||'').trim().toLowerCase();
  const items=all.filter(r=>['subject','year','kind'].every(k=>!qs.get(k)||r[k]===qs.get(k))&&(!qs.get('formats')||formatsOf(r).includes(qs.get('formats')))&&[r.title,r.subject,r.tags,r.summary].join(' ').toLowerCase().includes(q)).sort((a,b)=>Number(b.priority||0)-Number(a.priority||0)||String(b.updated).localeCompare(String(a.updated)));
  const page=Math.min(Math.max(1,parseInt(qs.get('page'),10)||1),Math.max(1,Math.ceil(items.length/12)));
  $('#total').textContent=items.length+' 份资料';$('#lastUpdate').textContent=items.length?'更新于 '+formatDate(items.map(r=>r.updated).sort().at(-1)):'';
  const group=items.slice((page-1)*12,page*12);
  const groups=settings.year?[[settings.year+' · 本学年',group.filter(r=>r.year===settings.year)],['其他学年',group.filter(r=>r.year!==settings.year)]]:[['',group]];
  $('#results').innerHTML=items.length?groups.filter(g=>g[1].length).map(([title,rows])=>(title?'<h3 class="year-title">'+escape(title)+'</h3>':'')+'<div class="cards">'+rows.map(card).join('')+'</div>').join('')+'<div class="actions">'+[page>1?[page-1,'上一页']:null,page*12<items.length?[page+1,'下一页']:null].filter(Boolean).map(([n,t])=>{const p=new URLSearchParams(qs);p.set('page',n);return '<a class="btn" href="?'+escape(p)+'#library">'+t+'</a>';}).join('')+'</div>':'<div class="panel notice"><h3>'+(all.length?'没有找到匹配的资料':'暂时还没有公开资料')+'</h3><p>'+(all.length?'可换个关键词，或清除筛选条件。':'有合适的笔记，可以先提交给整理者审核。')+'</p>'+ (all.length?btn('清除筛选','id="clear"'):'<a href="https://xiaobotu-study-library.gx2jwkwhpv.chatgpt.site/resources/submit">提交资料 ↗</a>')+'</div>';
  $('#clear')?.addEventListener('click',()=>form.reset());
 }
 form.oninput=()=>refresh(true);form.onsubmit=e=>{e.preventDefault();refresh(true);};form.onreset=e=>{e.preventDefault();for(const el of form.elements)if(el.name)el.value='';refresh(true);};
 refresh();
 if(all.some(r=>String(r.tags).includes('2024级整理')))$('#library').insertAdjacentHTML('afterbegin','<p class="notice"><strong>往年资料说明</strong> '+archiveNotice+'</p>');
 if(true){main.insertAdjacentHTML('beforeend',shareBlock());attachShare();}
}
function info(rows){return '<dl class="info-grid">'+rows.filter(([k,v])=>v!==null&&v!==undefined&&v!=='').map(([k,v])=>'<div><dt>'+escape(k)+'</dt><dd>'+escape(v)+'</dd></div>').join('')+'</dl>';}
function fileRow(f,preview=true){
 const ext=String(f.ext||'').toLowerCase(), inline=['pdf','png','jpg','jpeg','webp'].includes(ext);
 return '<div class="file-row"><div><strong>'+escape(f.name)+'</strong><p class="muted">'+escape(ext.toUpperCase())+' · '+size(f.size)+(inline?'':' · 下载后使用办公软件打开')+'</p></div><div class="actions">'+(inline&&preview?btn('预览','data-preview="'+escape(f.id)+'" data-ext="'+escape(ext)+'"'):'')+'<a class="btn primary" download="'+escape(f.name)+'" href="'+escape(files[f.id])+'">下载</a></div></div>';
}
function shareBlock(){
 if(location.hostname!=='2624177099-prog.github.io') return '';
 return '<details class="panel"><summary>分享此页</summary><div class="stack"><p>使用相机扫码打开此页。</p><img width="160" height="160" loading="lazy" src="'+qrImage(location.href.split("#")[0])+'" alt="资料分享二维码"><label class="field"><span>资料链接</span><input readonly value="'+escape(location.href.split("#")[0])+'"></label>'+btn('复制链接','id="copyLink"')+'<span role="status" id="copyResult"></span></div></details>';
}
function attachShare(){const copy=$('#copyLink');if(copy)copy.onclick=async()=>{try{await navigator.clipboard.writeText(location.href.split("#")[0]);$('#copyResult').textContent='链接已复制。';}catch{$('#copyResult').textContent='请长按或选中上方链接复制。';}};}
function support(){
 const channels=(settings.channels||[]).filter(x=>trustedURL(x.url));if(!channels.length)return '';
 return '<details class="panel"><summary>自愿支持整理 · 查看收款码</summary><p>本份资料可免费下载。如果这份笔记帮你省了点时间，也欢迎随手支持一下，金额随意。谢谢你，祝期末顺利！——小博土</p>'+channels.map(c=>'<p>'+escape(c.channel)+'收款码</p><a href="'+trustedURL(c.url)+'" target="_blank" rel="noopener"><img width="150" loading="lazy" alt="'+escape(c.channel)+'收款码，可点开大图" src="'+trustedURL(c.url)+'"></a>').join('')+'<p>点开可放大，手机上可长按保存，再按支付应用提示操作。</p></details>';
}
async function detail(id){
 const {resource:r,versions=[],errata=[],ratings=[]}=await api('/api/resource/'+enc(id));
 const v=versions.find(x=>String(x.id)===String(r.current))||versions[0];if(!v)throw Error('资料暂时没有可用版本。');
 const oldYear=settings.year&&r.year&&/\d{4}/.test(r.year)&&Number(r.year.match(/\d{4}/)[0])<Number(String(settings.year).match(/\d{4}/)?.[0]);
 const notice=String(r.tags).includes('2024级整理')?'<p class="notice"><strong>资料使用说明</strong> '+archiveNotice+'</p>':'';
 main.innerHTML=lead(r.title,r.summary||'')+notice+'<div class="detail-layout stack"><section class="panel"><div class="section-head"><h2>适用范围</h2><span class="tag">'+escape(v.label)+'</span></div>'+info([['科目',r.subject],['学年',r.year],['年级',r.grade],['教材与版本',r.textbook||'未填写'],['资料类型',r.kind],['公开署名',r.author||'匿名'],['上传日期',formatDate(r.created)],['更新日期',formatDate(r.updated)]])+(oldYear?'<p class="notice">往年资料，请结合本学期教材、授课内容和考试要求使用。</p>':'')+'</section><section class="panel"><h2>制作与核对说明</h2>'+info([['内容来源',v.source||'未说明'],['AI 参与方式',v.ai||'未说明'],['人工核对',v.checkStatus||'待说明'],['核对范围与依据',v.scope||'未说明'],['核对日期',v.checked||'未填写']])+(v.issues?'<p class="notice"><strong>已知问题</strong> '+escape(v.issues)+'</p>':'')+'</section><section class="panel"><h2>预览与免费下载</h2>'+notice+'<div class="stack">'+((v.files||[]).filter(f=>Number(f.enabled)!==0).map(f=>fileRow(f)).join('')||'<p>此版本附件已停用。</p>')+'</div><div id="viewer"></div><p class="muted">手机内置浏览器无法保存时，可用右上角菜单选择“在浏览器打开”，再点下载。</p></section>'+support()+'<section class="panel"><h2>修订记录</h2>'+versions.map(k=>'<div class="admin-row"><strong>'+escape(k.label)+'</strong> <small>'+escape(formatDate(k.created))+'</small><p>'+escape(k.revision||'未填写修订摘要')+'</p>'+(k!==v&&Number(k.oldAllowed)?(k.files||[]).filter(f=>Number(f.enabled)!==0).map(f=>fileRow(f,false)).join(''):'')+'</div>').join('')+'</section>'+shareBlock()+'<div class="guide"><div><strong>发现题目或答案有误？</strong><p>注明页码、题号或章节，反馈会关联当前版本。</p></div><a class="btn" href="https://xiaobotu-study-library.gx2jwkwhpv.chatgpt.site/resources/feedback?id='+enc(r.id)+'&version='+enc(v.id)+'">提交反馈 ↗</a></div></div>';
 $('#viewer').closest('section').insertAdjacentHTML('beforebegin',publicCorrections(errata));
 main.insertAdjacentHTML('beforeend','<section class="panel"><h2>资料评价</h2><a class="btn" href="https://xiaobotu-study-library.gx2jwkwhpv.chatgpt.site/resources/'+enc(id)+'#rateForm">前往原站评价 ↗</a></section>');
 main.querySelectorAll('[data-preview]').forEach(b=>b.onclick=()=>{const u=escape(files[b.dataset.preview]);const viewer=$('#viewer');viewer.innerHTML='<div class="actions"><a class="btn" href="'+u+'" target="_blank" rel="noopener">独立打开 ↗</a>'+btn('关闭预览','id="closePreview"')+'</div>'+(b.dataset.ext==='pdf'?'<iframe title="PDF 资料预览" loading="lazy" style="width:100%;height:68vh;border:0" src="'+u+'"></iframe>':'<a href="'+u+'" target="_blank" rel="noopener"><img style="max-width:100%" loading="lazy" alt="附件图片预览" src="'+u+'"></a>');$('#closePreview').onclick=()=>{viewer.replaceChildren();b.focus();};viewer.scrollIntoView({block:'nearest'});});
 attachShare();
}
function about(){
 main.innerHTML=lead('关于与使用说明','陈健博（小博土） · 川北医学院 2024 级临床医学本科生')+'<div class="stack"><section class="panel"><h2>这些资料从哪里来</h2><p>这里收录我自己整理、以及同学授权分享的复习讲义、练习与笔记。当前公开资料均可免费下载。拥有商业分享授权的作者可申请出售，由小博土审核；交易和结算尚未开放。本站由学生个人维护，与学校官方无隶属关系。</p></section><section class="panel"><h2>拿到资料后，先看这三项</h2><ol><li>核对科目、教材版次和适用学年。往年资料请对照本学期教材与授课要求。</li><li>查看每个版本的制作说明、AI 参与方式和人工核对范围。审核通过后才会公开，内容仍可能有错。</li><li>遇到疑问，保留页码或题号并提交纠错。修订后可以在详情页看到版本变化。</li></ol></section><section class="panel"><h2>投稿与权利反馈</h2><p>投稿需说明来源及分享授权。可匿名署名，表单中的私人联系方式仅管理员可见。若资料涉及授权、隐私或其他权益问题，请说明对应资料和位置。</p><div class="actions"><a class="btn primary" href="https://xiaobotu-study-library.gx2jwkwhpv.chatgpt.site/resources/submit">参与投稿</a><a class="btn" href="https://xiaobotu-study-library.gx2jwkwhpv.chatgpt.site/resources/feedback">纠错或权利反馈</a></div>'+(settings.contact?'<p>公开联系方式　'+escape(settings.contact)+'</p>':'')+'</section>'+shareBlock()+'</div>';
 attachShare();
}
async function feedback(){
 const items=catalog.items||[];let rid=qs.get('id')||'';
 if(rid&&!items.some(r=>r.id===rid))rid='';
 main.innerHTML=lead('纠错与权利反馈','请留下足够定位问题的信息。反馈和联系方式仅管理员可见。')+'<form class="panel stack" id="feedbackForm"><label class="field"><span>关联资料</span><select name="id"><option value="">全站反馈（未指定资料）</option>'+items.map(r=>'<option value="'+escape(r.id)+'"'+selected(r.id,rid)+'>'+escape(r.title)+'</option>').join('')+'</select></label><label class="field"><span>资料版本</span><select name="version" required disabled></select></label>'+choice('问题类型','type',['内容纠错','文件问题','权利反馈','其他'],'内容纠错')+field('页码、章节或题号','location','',false,'text','placeholder="例如：第 12 页，第 3 题"')+field('问题描述','description','',true,'textarea')+field('建议修改与依据','suggestion','',false,'textarea')+field('私人联系方式（可选）','contact')+'<div>'+btn('提交反馈','type="submit"',true)+'</div>'+statusBox()+'</form>';
 const form=$('#feedbackForm'),ridSelect=form.elements.id,vSelect=form.elements.version;let epoch=0;
 const change=async()=>{const tick=++epoch;vSelect.disabled=true;vSelect.innerHTML='<option value="">未关联具体资料</option>';if(!ridSelect.value)return;msg(form,'正在读取版本…');try{const d=await api('/api/resource/'+enc(ridSelect.value));if(tick!==epoch)return;vSelect.innerHTML=d.versions.map(v=>'<option value="'+escape(v.id)+'"'+selected(v.id,qs.get('version')||d.resource.current)+'>'+escape(v.label)+'</option>').join('');vSelect.disabled=false;msg(form,'');}catch(e){if(tick===epoch)msg(form,e.message+' 请重新选择资料后重试。');}};
 ridSelect.onchange=change;if(rid)await change();
 const requestId=crypto.randomUUID();form.onsubmit=async e=>{e.preventDefault();if(ridSelect.value&&(vSelect.disabled||!vSelect.value)){msg(form,'请先选择可用资料与版本。');return;}const b=$('[type=submit]',form);b.disabled=true;try{await post('/api/feedback',{...paramsToObject(form),requestId});form.innerHTML='<h2>反馈已收到</h2><p>管理员将结合你提交的资料版本核对。</p><a class="btn" href="./">返回资料库</a>';}catch(err){msg(form,err.message);b.disabled=false;}};
}
const metaFields=(r={})=>field('资料名称','title',r.title,true)+field('一句话简介','summary',r.summary,true,'textarea')+'<div class="grid">'+field('科目','subject',r.subject,true)+field('适用学年','year',r.year,true,'text','placeholder="例如：2026—2027"')+field('资料类型','kind',r.kind,true,'text','placeholder="例如：复习讲义"')+field('适用年级','grade',r.grade)+field('教材名称与版本','textbook',r.textbook)+field('标签（逗号分隔）','tags',r.tags)+field('公开署名（留空为匿名）','author',r.author)+'</div>';
const versionFields=()=>'<div class="grid">'+field('版本号','label','',true,'text','placeholder="例如：V1.0"')+choice('AI 参与方式','ai',['未说明','未使用','辅助排版','辅助整理','辅助生成初稿','其他（在来源中详述）'],'未说明')+choice('人工核对状态','checkStatus',['待说明','未核对','部分核对','已按所列范围核对'],'待说明')+field('核对日期','checked','','','date')+'</div>'+field('核对范围与依据','scope','','','textarea')+field('内容来源及分享授权情况','source','',true,'textarea')+field('已知问题','issues','','','textarea')+field('修订摘要','revision','',true,'text','placeholder="例如：首次整理，覆盖导论至第 3 章"');
function uploadForm(r=null,admin=false){
 const exts=settings.extensions||['pdf','docx','pptx','xlsx','png','jpg','jpeg','webp'];
 return '<form class="panel stack" id="uploadForm"><h2>资料信息</h2>'+metaFields(r||{})+(admin?'':saleFields()+field('私人联系方式（申请出售时必填，仅管理员可见）','contact'))+'<h2>版本与制作说明</h2>'+versionFields()+'<h2>上传附件</h2><label class="field dropzone" tabindex="0"><strong>选择文件，或拖到这里</strong><small>'+escape(exts.join('、').toUpperCase())+' · 最多 '+Number(settings.maxFiles||4)+' 个 · 单件 '+Number(settings.maxFileMB||8)+' MiB · 合计 '+Number(settings.maxTotalMB||12)+' MiB</small><input required multiple type="file" name="files" accept="'+exts.map(i=>'.'+escape(i)).join(',')+'"></label><p id="fileSelection" class="muted"></p><label class="check"><input type="checkbox" name="authorized" value="yes" required> 我确认有权分享所提交的文件，已检查其中的私人信息。</label><div class="actions">'+btn(admin?(r?'保存新版本':'保存为草稿'):'提交审核','type="submit"',true)+btn('取消上传','type="button" id="cancelUpload" hidden')+'</div><progress aria-label="文件上传进度" max="100" value="0" hidden></progress>'+statusBox()+'</form>';
}
function wireUpload(r=null,admin=false){
 const form=$('#uploadForm'),file=form.elements.files,drop=$('.dropzone',form),progress=$('progress',form),cancel=$('#cancelUpload'),send=$('[type=submit]',form);let key=crypto.randomUUID(),xhr;
 if(!admin){const toggle=()=>{const paid=form.elements.saleMode.value==='paid';$('#saleFields').hidden=!paid;for(const name of ['price','saleRights','contact'])form.elements[name].required=paid;};form.elements.saleMode.onchange=toggle;toggle();}
 form.oninput=()=>{key=crypto.randomUUID();};const selection=()=>{$('#fileSelection').textContent=Array.from(file.files).map(f=>f.name+'（'+size(f.size)+'）').join('、');};file.onchange=selection;
 drop.ondragover=e=>{e.preventDefault();drop.classList.add('dragging');};drop.ondragleave=()=>drop.classList.remove('dragging');drop.ondrop=e=>{e.preventDefault();drop.classList.remove('dragging');if(xhr)return;try{file.files=e.dataTransfer.files;key=crypto.randomUUID();selection();}catch{msg(form,'请使用“选择文件”添加附件。');}};
 drop.onkeydown=e=>{if(e.target===drop&&[' ','Enter'].includes(e.key)){e.preventDefault();file.click();}};
 cancel.onclick=()=>xhr?.abort();
 form.onsubmit=e=>{e.preventDefault();if(xhr)return;const files=Array.from(file.files);if(files.length>Number(settings.maxFiles||4)||files.some(f=>f.size>(settings.maxFileMB||8)*1048576)||files.reduce((sum,f)=>sum+f.size,0)>(settings.maxTotalMB||12)*1048576){msg(form,'附件数量或大小超过限制，请重新选择。');return;}
  const data=new FormData(form);if(r)data.set('id',r.id);data.set('requestId',key);
  xhr=new XMLHttpRequest();xhr.open('POST',admin?'/api/admin/upload':'/api/submit');send.disabled=true;cancel.hidden=false;progress.hidden=false;progress.value=0;
  const controls=[...form.querySelectorAll('input,select,textarea')];controls.forEach(c=>c.disabled=true);
  const restore=()=>{xhr=null;send.disabled=false;send.textContent='重试提交';controls.forEach(c=>c.disabled=false);cancel.hidden=true;progress.hidden=true;};
  xhr.upload.onprogress=e=>{if(e.lengthComputable){progress.value=Math.floor(e.loaded/e.total*100);msg(form,progress.value===100?'传输完成，正在保存文件和资料记录…':'正在传输 '+progress.value+'%');}};
  xhr.onload=()=>{let result;try{result=JSON.parse(xhr.responseText);}catch{result={error:'服务器响应异常'};}if(xhr.status<200||xhr.status>=300||!result.ok){restore();msg(form,result.error||'提交失败，请重新选择或重试。');return;}xhr=null;form.innerHTML='<h2>'+(admin?'已保存':'投稿已提交')+'</h2><p>'+(admin?'请在资料管理中检查发布状态。':'待审核。请保存回执编号：<strong>'+escape(result.receipt||result.id)+'</strong>')+'</p><a class="btn primary" href="'+(admin?'/admin':'/resources')+'">'+(admin?'返回资料管理':'返回资料库')+'</a>';};
  xhr.onerror=()=>{restore();msg(form,'连接中断，请重试。');};xhr.onabort=()=>{restore();msg(form,'已停止本次传输。若服务器已收到，重试会使用同一提交编号。');};msg(form,'准备上传…');xhr.send(data);
 };
}
function submission(){main.innerHTML=lead('投稿资料','提交后进入审核。公开署名会显示在资料页，私人联系方式仅管理员可见。')+uploadForm();wireUpload();}
function handleForm(form,fn){
 form.onsubmit=async event=>{event.preventDefault();const b=event.submitter||$('[type=submit]',form);if(b?.disabled)return;if(b)b.disabled=true;msg(form,'正在保存…');try{const result=await fn(paramsToObject(form),form);msg(form,typeof result==='string'?result:'已保存。');}catch(e){msg(form,e.message);}finally{if(b)b.disabled=false;}};
}
function managementNav(){
 return '<nav class="actions admin-nav" aria-label="后台导航">'+[['overview','概览'],['weekly','每周统计'],['resources','资料管理'],['pending','投稿审核'],['feedback','纠错与反馈'],['errata','公开勘误'],['notes','匿名来信'],['subjects','科目与标签'],['settings','网站设置'],['upload','上传资料']].map(([t,label])=>'<a class="btn'+((qs.get('tab')||'overview')===t?' primary':'')+'" href="/admin?tab='+t+'">'+label+'</a>').join('')+'</nav>';
}
const manageURL=id=>'/admin?tab=edit&id='+enc(id);
function manageList(items){return items.length?items.map(r=>'<div class="file-row"><div><strong>'+escape(r.title)+'</strong><p class="muted">'+escape([r.subject,r.year,r.label,stateName[r.status]].filter(Boolean).join(' · '))+'</p></div><a class="btn" href="'+manageURL(r.id)+'">查看与管理</a></div>').join(''):'<p class="notice">暂无符合条件的资料。</p>';}
function weeklyErrorName(event){
 const [kind,...reason]=event.split('_');
 const operation=kind==='preview'?'预览':'下载';
 const reasons={unavailable:'链接失效或文件未公开',unsupported:'格式不支持预览',missing:'存储中缺少附件',service_error:'文件服务异常'};
 return operation+' · '+(reasons[reason.join('_')]||'请求错误');
}
async function weeklyTab(){
 const data=await api('/api/admin/weekly');
 const link=row=>row.rid&&row.title?'<a href="'+manageURL(row.rid)+'">'+escape(row.title)+'</a>':'未关联到公开资料';
 const dateRange=escape(data.startDay)+' 至 '+escape(data.endDay)+'（北京时间，含今天）';
 const total=rows=>rows.reduce((sum,row)=>sum+Number(row.requests),0);
 const ranking=data.downloads.map((row,i)=>'<li class="file-row"><span>'+String(i+1)+'. '+link(row)+'</span><strong>'+Number(row.requests)+' 次</strong></li>').join('');
 const failures=data.errors.map(row=>'<li class="file-row"><div><strong>'+link(row)+'</strong><p class="muted">'+escape(weeklyErrorName(row.event))+'</p></div><span>'+Number(row.requests)+' 次</span></li>').join('');
 main.innerHTML=lead('每周统计',dateRange)+managementNav()+
  '<section class="panel"><h2>资料下载排行</h2><p>近七天共 '+total(data.downloads)+' 次下载请求返回附件。统计从此功能上线起记录，重复请求会重复计数。</p>'+
  (ranking?'<ol>'+ranking+'</ol>':'<p class="muted">这段时间还没有记录到下载请求。</p>')+'</section>'+
  '<section class="panel"><h2>文件请求错误</h2><p>近七天共 '+total(data.errors)+' 次。涵盖下载和预览接口返回的错误。</p>'+
  (failures?'<ul>'+failures+'</ul>':'<p class="muted">这段时间没有记录到文件请求错误。</p>')+'</section>'+
  '<section class="panel"><h2>纠错与权利反馈</h2>'+info([['近七天新收到',data.feedback.received],['当前待处理（全部日期）',data.feedback.pending],['当前核对中（全部日期）',data.feedback.checking]])+
  '<a class="btn" href="/admin?tab=feedback">查看与处理反馈</a></section>';
}
async function admin(){
 if(qs.get('tab')==='weekly'){await weeklyTab();return;}
 adminData=await api('/api/admin');settings=adminData.settings;const {items=[],feedback:messages=[],counts={}}=adminData;
 const tab=qs.get('tab')||'overview',head=lead('资料管理','上传、审核与修订资料，处理同学的反馈。')+managementNav();
 if(tab==='notes'||tab==='topics'){await noteAdmin(head);return;}
 if(['errata'].includes(tab)){await communityAdmin(tab,head,items);return;}
 if(tab==='upload'||tab==='newversion'){
  const r=tab==='newversion'?(await api('/api/admin/resource/'+enc(qs.get('id')))).resource:null;
  main.innerHTML=head+'<h2>'+(r?'更新版本 · '+escape(r.title):'上传新资料')+'</h2>'+(r?.status==='published'?'<p class="notice">保存后此版本将立即成为公开版本。</p>':'')+uploadForm(r,true);wireUpload(r,true);return;
 }
 if(tab==='edit'){
  const {resource:r,versions}=await api('/api/admin/resource/'+enc(qs.get('id')));
  main.innerHTML=head+'<section class="panel"><div class="section-head"><h2>'+escape(r.title)+'</h2><span class="tag">'+escape(stateName[r.status])+'</span></div>'+info([['投稿方式',r.saleCents?'申请出售 · 拟售价 ¥'+(r.saleCents/100).toFixed(2):'免费分享'],['投稿者私人联系方式',r.contact||'未提供'],['退回原因',r.reason||'']])+'<div class="actions"><a class="btn primary" href="/admin?tab=newversion&id='+enc(r.id)+'">上传新版本</a>'+(r.status==='published'?'<a class="btn" href="'+detailUrl(r.id)+'">查看公开页 ↗</a>':'')+'</div></section><details class="panel"><summary>编辑资料信息、科目与标签</summary><form class="stack" id="editForm">'+metaFields(r)+field('目录排序（数值越大越靠前）','priority',r.priority||0,false,'number','min="0" max="999"')+btn('保存修改','type="submit"',true)+statusBox()+'</form></details><section class="panel"><h2>发布与审核</h2><p>请检查来源、授权、文件完整性与隐私信息。撤回后原附件链接停止提供下载。</p><form class="stack" id="statusForm"><label class="field"><span>目标状态</span><select name="status">'+Object.entries(stateName).filter(([k])=>r.saleCents?k!=='published':k!=='approved_sale').map(([key,val])=>'<option value="'+key+'"'+selected(key,r.status)+'>'+val+'</option>').join('')+'</select></label>'+field('退回原因（需补充时必填）','reason',r.reason||'','', 'textarea')+btn('保存状态','type="submit"',true)+statusBox()+'</form></section><section class="panel"><h2>版本、制作说明与附件</h2>'+versions.map(v=>'<article class="admin-row"><h3>'+escape(v.label)+' '+(v.id===r.current?'<span class="tag">当前版本</span>':'')+'</h3>'+info([['修订',v.revision],['来源',v.source],['AI 参与',v.ai],['核对状态',v.checkStatus],['核对范围',v.scope],['核对日期',v.checked],['已知问题',v.issues]])+(v.id!==r.current?btn(Number(v.oldAllowed)?'停止提供旧版':'允许下载旧版','data-act="version" data-id="'+escape(v.id)+'" data-flag="'+(Number(v.oldAllowed)?0:1)+'"'):'')+(v.files||[]).map(f=>'<div class="file-row"><div><strong>'+escape(f.name)+'</strong><p class="muted">'+size(f.size)+' · '+(Number(f.enabled)?'启用':'停用')+'</p></div><div class="actions"><a class="btn" href="/file/'+enc(f.id)+'?review=1">审核下载</a>'+btn(Number(f.enabled)?'停用附件':'启用附件','data-act="file" data-id="'+escape(f.id)+'" data-flag="'+(Number(f.enabled)?0:1)+'"')+'</div></div>').join('')+'</article>').join('')+'<p id="actionMsg" role="status"></p></section>';
  handleForm($('#editForm'),async data=>{await post('/api/admin/edit',{...data,id:r.id});location.reload();});
  handleForm($('#statusForm'),async data=>{await post('/api/admin/status',{...data,id:r.id});location.reload();});
  main.querySelectorAll('[data-act]').forEach(b=>b.onclick=async()=>{b.disabled=true;const action=b.dataset.act;try{await post('/api/admin/'+action,{id:b.dataset.id,[action==='file'?'enabled':'oldAllowed']:Number(b.dataset.flag)});location.reload();}catch(e){$('#actionMsg').textContent=e.message;b.disabled=false;}});
  return;
 }
 if(tab==='settings'){
  main.innerHTML=head+'<section class="panel"><h2>资料备份</h2><p>包含文件、版本及私人投稿信息，请保存在自己的设备上。</p><a class="btn" href="/api/admin/backup">下载完整备份</a></section><section class="panel"><h2>展示信息</h2><form id="settingsForm" class="stack">'+field('首页介绍','intro',settings.intro,false,'textarea')+field('当前学年','year',settings.year)+field('公告','announcement',settings.announcement,false,'textarea')+field('公开联系方式','contact',settings.contact)+field('独立备用入口（已上线的 HTTPS 地址）','backupUrl',settings.backupUrl,false,'url')+btn('保存设置','type="submit"',true)+statusBox()+'</form></section><section class="panel"><h2>自愿支持</h2><p>仅显示已配置渠道。此处上传的图片将作为收款码公开展示。</p>'+['微信','支付宝'].map(c=>{const channel=(settings.channels||[]).find(k=>k.channel===c);return '<form class="stack support-form admin-row" data-channel="'+c+'"><h3>'+c+'</h3>'+(channel?'<img width="120" alt="'+c+'现有收款码" src="'+trustedURL(channel.url)+'">':'<p class="muted">尚未配置</p>')+'<input type="file" accept="image/png,image/jpeg,image/webp" name="file" aria-label="'+c+'收款码图片"><div class="actions">'+btn('上传或替换','type="submit"')+(channel?btn('移除渠道','type="button" data-remove'):'')+'</div>'+statusBox()+'</form>';}).join('')+'</section>';
  handleForm($('#settingsForm'),data=>post('/api/admin/settings',data));
  for(const form of main.querySelectorAll('.support-form')){
   const update=async(remove=false)=>{const data=new FormData(form);data.set('channel',form.dataset.channel);if(remove)data.set('remove','yes');else if(!form.elements.file.files.length)throw Error('请先选择图片。');await api('/api/admin/support',{method:'POST',body:data});location.reload();};
   handleForm(form,()=>update());const remove=$('[data-remove]',form);if(remove)remove.onclick=async()=>{remove.disabled=true;try{await update(true);}catch(e){msg(form,e.message);remove.disabled=false;}};
  }return;
 }
 if(tab==='feedback'){
  main.innerHTML=head+'<section class="panel"><h2>纠错与权利反馈</h2>'+(messages.length?messages.map(f=>'<article class="admin-row"><h3>'+escape(f.type)+'</h3>'+info([['资料',items.find(r=>r.id===f.rid)?.title||'全站反馈'],['版本标识',f.version],['页码或题号',f.location],['问题',f.description],['建议与依据',f.suggestion],['私人联系方式',f.contact],['收到时间',formatDate(f.created)]])+'<form class="stack feedback-update" data-id="'+escape(f.id)+'">'+choice('处理状态','status',feedbackStates,f.status)+btn('更新状态','type="submit"')+statusBox()+'</form></article>').join(''):'<p class="notice">暂无反馈。</p>')+'</section>';
  for(const f of main.querySelectorAll('.feedback-update'))handleForm(f,data=>post('/api/admin/feedback',{...data,id:f.dataset.id}));return;
 }
 if(tab==='subjects'){
  const vocab=key=>[...new Set(items.flatMap(r=>String(r[key]||'').split(/[,，、]/)).map(s=>s.trim()).filter(Boolean))].sort();
  main.innerHTML=head+'<section class="panel"><h2>科目与标签</h2><p>点击资料管理入口，可修改该资料所属科目及标签。筛选项随公开资料同步更新。</p>'+info([['科目',vocab('subject').join('、')||'暂无'],['标签',vocab('tags').join('、')||'暂无']])+manageList(items)+'</section>';return;
 }
 if(tab==='pending'||tab==='resources'){
  main.innerHTML=head+'<section class="panel"><h2>'+(tab==='pending'?'投稿审核':'全部资料')+'</h2>'+manageList(tab==='pending'?items.filter(r=>['pending','returned'].includes(r.status)):items)+'</section>';return;
 }
 main.innerHTML=head+'<section class="panel"><h2>概览</h2>'+info([['已发布',items.filter(r=>r.status==='published').length],['待审核投稿',items.filter(r=>r.status==='pending').length],['待处理反馈',messages.filter(f=>f.status==='待处理').length],...(counts.views||counts.downloads?[['页面访问请求',counts.views||0],['下载请求',counts.downloads||0]]:[])])+(counts.views||counts.downloads?'<p class="muted">请求次数可能包含重复访问和机器人，不代表独立人数或已保存文件数。</p>':'')+'</section><section class="panel"><h2>最近资料</h2>'+manageList(items.slice(0,5))+'</section>';
}
async function start(){
 if(path==='/admin'){await admin();return;}
 files=(await snapshot).files;catalog=await api('/api/catalog');settings=catalog.settings||{};$('#publicContact').textContent=settings.contact?'联系小博土 · '+settings.contact:'';
 if(path==='/resources'||path==='/')catalogHome();
 else if(path==='/resources/submit')submission();
 else if(path==='/resources/about')about();
 else if(path==='/resources/feedback')await feedback();
 else if(path.startsWith('/resources/'))await detail(decodeURIComponent(path.slice('/resources/'.length)));
 else throw Object.assign(Error('请返回目录查找可用资料。'),{status:404});
 const active=path.startsWith('/resources/')&&!['/resources/about','/resources/submit'].includes(path)?'/resources':path;
 for(const link of document.querySelectorAll('header nav a'))if(link.getAttribute('href')===active)link.setAttribute('aria-current','page');
}
const browserKeys=new Map();
function ballotKey(scope){
 const key='xb-ballot-'+scope;
 let id=browserKeys.get(key);
 try{id=localStorage.getItem(key)||id;}catch{}
 if(!id){id=crypto.randomUUID();browserKeys.set(key,id);try{localStorage.setItem(key,id);}catch{}}
 return id;
}
function fallbackLink(){
 return settings.backupUrl?'<p><a class="btn" href="'+trustedURL(settings.backupUrl)+'" target="_blank" rel="noopener">备用资料入口 ↗</a></p>':'';
}
function noteForm(kind,label,placeholder){
 return '<form class="stack note-form" data-kind="'+kind+'"><label class="field"><span>'+label+'</span><textarea name="body" rows="2" maxlength="600" required placeholder="'+placeholder+'"></textarea></label>'+btn('匿名提交','type="submit"',true)+statusBox()+'</form>';
}
function installNotes(){
 const node=$('#topicPoll');
 node.innerHTML='<h2>给小博土留言</h2><p class="muted">只写你想说的话。公开留言审核后展示，已核实的打赏留言优先。</p>'+noteForm('comment','公开留言','这份资料帮到了你吗？网站哪里还可以改？')+'<div id="readerNotes"></div><div class="note-grid"><section><h3>下一份想看什么？</h3>'+noteForm('topic','给小博土的选题建议','写下科目、章节，或最想弄懂的一道题')+'</section><section><h3>匿名反馈</h3>'+noteForm('feedback','仅小博土可见','遇到的问题，或想私下说的话')+'</section></div>';
 for(const form of node.querySelectorAll('.note-form')){
  let requestId=crypto.randomUUID();
  form.oninput=()=>{requestId=crypto.randomUUID();};
  handleForm(form,async data=>{
   const kind=form.dataset.kind,result=await post('/api/notes',{kind,body:data.body,requestId});
   form.reset();requestId=crypto.randomUUID();
   return kind==='comment'?'已收到，审核后公开。若想让此条留言显示打赏金额，可在打赏备注写下编号 '+result.receipt+'，或凭此编号私下联系小博土核对。':'已送达，仅小博土可见。';
  });
 }
 let page=0;
 async function loadNotes(){
  const list=$('#readerNotes');
  try{
   const result=await api('/api/notes?offset='+page*20);
   list.innerHTML='<h3>同学留言</h3>'+ (result.items.length?result.items.map(n=>'<article class="reader-note"><div class="note-author">匿名同学 '+(n.tip?'<span class="tip-badge">已打赏 ¥'+(n.tip/100).toFixed(2)+'</span>':'')+'</div><p>'+escape(n.body)+'</p><div class="note-meta"><small>'+formatDate(n.created)+'</small>'+btn('赞 · '+n.likes,'data-like="'+escape(n.id)+'"')+'</div></article>').join(''):'<p class="muted">暂无已公开的留言。</p>')+statusBox()+'<div class="actions">'+(page?btn('上一页','data-prev'):'')+(result.more?btn('下一页','data-next'):'')+'</div>';
   for(const button of list.querySelectorAll('[data-like]'))button.onclick=async()=>{button.disabled=true;try{const res=await post('/api/like',{id:button.dataset.like});button.textContent='已赞 · '+res.likes;}catch(err){msg(list,err.message);button.disabled=false;}};
   $('[data-prev]',list)?.addEventListener('click',()=>{page--;loadNotes();});$('[data-next]',list)?.addEventListener('click',()=>{page++;loadNotes();});
  }catch(err){list.innerHTML='<p>'+escape(err.message)+'</p>'+btn('重新加载留言','data-retry');$('[data-retry]',list).onclick=loadNotes;}
 }
 loadNotes();
}
async function noteAdmin(head){
 const kind=qs.get('kind')||'comment',offset=Math.max(0,Number(qs.get('offset'))||0),result=await api('/api/admin/notes?kind='+enc(kind)+'&offset='+offset);
 const link=(k,n=0)=>'/admin?tab=notes&kind='+enc(k)+'&offset='+n;
 main.innerHTML=head+'<section class="panel"><h2>匿名来信</h2><nav class="actions">'+[['comment','公开留言审核'],['topic','选题建议'],['feedback','私密反馈']].map(([k,t])=>'<a class="btn" href="'+link(k)+'">'+t+'</a>').join('')+'</nav>'+result.items.map(n=>'<article class="reader-note"><small>'+formatDate(n.created)+'</small><p>'+escape(n.body)+'</p>'+(kind==='comment'?'<form class="stack" data-id="'+escape(n.id)+'"><small>打赏匹配编号 '+escape(n.receipt)+'</small><label class="field">公开状态<select name="visible"><option value="no">未公开</option><option value="yes"'+(n.visible?' selected':'')+'>公开</option></select></label>'+field('实际到账金额（元，零表示普通留言）','amount',(n.tip/100).toFixed(2),true,'number','min="0" max="999999.99" step="0.01"')+'<label><input name="verified" type="checkbox" value="yes"> 已逐笔核对收款记录、留言编号与金额</label>'+btn('保存','type="submit"')+statusBox()+'</form>':'')+'</article>').join('')+(result.items.length?'':'<p>暂未收到。</p>')+'<div class="actions">'+(offset?'<a href="'+link(kind,Math.max(0,offset-20))+'">上一页</a>':'')+(result.more?'<a href="'+link(kind,offset+20)+'">下一页</a>':'')+'</div></section>';
 for(const form of main.querySelectorAll('[data-id]'))handleForm(form,data=>post('/api/admin/note',{...data,id:form.dataset.id}).then(()=>undefined));
}
function publicCorrections(rows){
 return '<section class="panel"><h2>公开勘误</h2>'+(rows.length?rows.map(x=>'<article class="admin-row"><h3>'+escape(x.label)+' · '+escape(x.location)+'</h3>'+info([['原文',x.original],['更正',x.correction],['依据',x.basis],['公布日期',formatDate(x.created)]])+'</article>').join(''):'<p class="muted">暂无已公布的勘误。发现疑问可在页末反馈。</p>')+'</section>';
}
function readerRating(v,rows){
 const row=rows.find(x=>x.vid===v.id);
 return '<section class="panel"><h2>同学评价</h2><p>'+escape(v.label)+' · '+(row?row.avg+' / 5 分，共 '+row.n+' 条评分':'还没有评分')+'</p><form id="rateForm" class="stack"><label class="field"><span>这份资料对复习有帮助吗？</span><select name="score" required><option value="">请选择</option>'+['帮助很小','帮助较小','一般','有帮助','很有帮助'].map((s,i)=>'<option value="'+(i+1)+'">'+(i+1)+' 分 · '+s+'</option>').join('')+'</select></label><p class="muted">匿名读者评价，同一浏览器可更新评分。</p>'+btn('提交评分','type="submit"')+statusBox()+'</form></section>';
}
function saleFields(){
 return '<label class="field"><span>投稿方式</span><select name="saleMode"><option value="free">免费分享</option><option value="paid">申请出售</option></select></label><div id="saleFields" hidden>'+field('拟售价（元）','price','',false,'number','min="0.01" step="0.01" max="99999.99"')+'<label class="check"><input type="checkbox" name="saleRights" value="yes"> 我拥有原创作品或已取得商业销售授权。</label><p>出售申请请填写私人联系方式。管理员核对内容、来源和定价后答复。目前仅受理申请，尚未开放购买或结算。</p></div>';
}
async function communityAdmin(tab,head,items){
 if(tab==='topics'){
  const {poll}=await api('/api/catalog');
  main.innerHTML=head+'<section class="panel"><h2>选题投票</h2>'+info(poll.options.map(o=>[o.title,o.count+' 票']))+'<form class="stack">'+field('下一轮选题，每行一项（2–5 项）','options','',true,'textarea')+'<p>发布后结束当前轮次，新一轮从零票开始。</p>'+btn('发布新一轮','type="submit"')+statusBox()+'</form></section>';
  handleForm($('form',main),async data=>{await post('/api/admin/topics',data);location.reload();});return;
 }
 const result=await api('/api/admin/errata');
 main.innerHTML=head+'<section class="panel"><h2>发布公开勘误</h2><form class="stack"><label class="field"><span>资料</span><select name="resource" required><option value="">请选择</option>'+items.map(r=>'<option value="'+escape(r.id)+'">'+escape(r.title)+'</option>').join('')+'</select></label><label class="field"><span>版本</span><select name="vid" required></select></label>'+field('页码、章节或题号','location','',true)+field('原文','original','',true,'textarea')+field('更正内容','correction','',true,'textarea')+field('核对依据','basis','',true,'textarea')+btn('发布勘误','type="submit"')+statusBox()+'</form></section><section class="panel"><h2>已发布的勘误</h2>'+result.items.map(x=>'<form class="errata-remove admin-row" data-id="'+escape(x.id)+'"><strong>'+escape(x.title)+' · '+escape(x.label)+'</strong><p>'+escape(x.location)+' · '+escape(x.correction)+'</p>'+btn('撤回本条勘误','type="submit"')+statusBox()+'</form>').join('')+'</section>';
 const form=$('form',main),select=form.elements.resource,versions=form.elements.vid;
 select.onchange=async()=>{const id=select.value;versions.replaceChildren();if(!id)return;try{const r=await api('/api/admin/resource/'+enc(id));if(select.value===id)for(const v of r.versions)versions.add(new Option(v.label,v.id));}catch(e){msg(form,e.message);}};
 handleForm(form,async data=>{await post('/api/admin/errata',data);location.reload();});
 for(const f of main.querySelectorAll('.errata-remove'))handleForm(f,async()=>{await post('/api/admin/errata',{id:f.dataset.id});location.reload();});
}

start().catch(errorPage);
})();
