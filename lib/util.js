var crypto = require('crypto');

var binpack = require('binpack');
var base58 = require('base58-native');
var bignum = require('bignum');


/*
Used to convert getblocktemplate bits field into target if target is not included.
More info: https://en.bitcoin.it/wiki/Target
 */
exports.bignumFromBits = function(bitsString){
    var bitsBuff = new Buffer(bitsString, 'hex');
    var numBytes = bitsBuff.readUInt8(0);
    var bigBits = bignum.fromBuffer(bitsBuff.slice(1));
    var target = bigBits.mul(
        bignum(2).pow(
            bignum(8).mul(
                numBytes - 3
            )
        )
    );
    return target;
};

exports.doublesha = function(buffer){
    var hash1 = crypto.createHash('sha256');
    hash1.update(buffer);
    hash1 = hash1.digest();

    var hash2 = crypto.createHash('sha256');
    hash2.update(hash1);
    hash2 = hash2.digest();

    return hash2;
};

exports.reverseBuffer = function(buff){
    var reversed = new Buffer(buff.length);
    for (var i = buff.length - 1; i >= 0; i--)
        reversed[buff.length - i - 1] = buff[i];
    return reversed;
};

exports.reverseHex = function(hex){
    return exports.reverseBuffer(new Buffer(hex, 'hex')).toString('hex');
};

exports.reverseByteOrder = function(buff){
    for (var i = 0; i < 8; i++) buff.writeUInt32LE(buff.readUInt32BE(i * 4), i * 4);
    return exports.reverseBuffer(buff);
};

exports.uint256BufferFromHash = function(hex){

    var fromHex = new Buffer(hex, 'hex');

    if (fromHex.length != 32){
        var empty = new Buffer(32);
        empty.fill(0);
        fromHex.copy(empty);
        fromHex = empty;
    }

    return exports.reverseBuffer(fromHex);
};

exports.hexFromReversedBuffer = function(buffer){
    return exports.reverseBuffer(buffer).toString('hex');
};


/*
Defined in bitcoin protocol here:
 https://en.bitcoin.it/wiki/Protocol_specification#Variable_length_integer
 */
exports.varIntBuffer = function(n){
    if (n < 0xfd)
        return new Buffer([n]);
    else if (n < 0xffff){
        var buff = new Buffer(3);
        buff[0] = 0xfd;
        buff.writeUInt16LE(n, 1);
        return buff;
    }
    else if (n < 0xffffffff){
        var buff = new Buffer(5);
        buff[0] = 0xfe;
        buff.writeUInt32LE(n, 1);
        return buff;
    }
    else{
        var buff = new Buffer(9);
        buff[0] = 0xff;
        binpack.packUInt64(n, 'little').copy(buff, 1);
        return buff;
    }
};


/*
"serialized CScript" formatting as defined here:
 https://github.com/bitcoin/bips/blob/master/bip-0034.mediawiki#specification
Used to format height and date when putting into script signature:
 https://en.bitcoin.it/wiki/Script
 */
exports.serializeNumber = function(n){
    if (n < 0xfd){
        var buff = new Buffer(2);
        buff[0] = 0x1;
        buff.writeUInt8(n, 1);
        return buff;
    }
    else if (n <= 0xffff){
        var buff = new Buffer(4);
        buff[0] = 0x3;
        buff.writeUInt16LE(n, 1);
        return buff;
    }
    else if (n <= 0xffffffff){
        var buff = new Buffer(5);
        buff[0] = 0x4;
        buff.writeUInt32LE(n, 1);
        return buff;
    }
    else{
        return Buffer.concat([new Buffer([0x9]), binpack.packUInt64(n, 'little')]);
    }
};


/*
Used for serializing strings used in script signature
 */
exports.serializeString = function(s){

    if (s.length < 253)
        return Buffer.concat([
            new Buffer([s.length]),
            new Buffer(s)
        ]);
    else if (s.length < 0x10000)
        return Buffer.concat([
            new Buffer([253]),
            binpack.packUInt16(s.length, 'little'),
            new Buffer(s)
        ]);
    else if (s.length < 0x100000000)
        return Buffer.concat([
            new Buffer([254]),
            binpack.packUInt32(s.length, 'little'),
            new Buffer(s)
        ]);
    else
        return Buffer.concat([
            new Buffer([255]),
            binpack.packUInt64(s.length),
            new Buffer(s)
        ]);
};


/*
An exact copy of python's range feature. Written by Tadeck:
 http://stackoverflow.com/a/8273091
 */
exports.range = function(start, stop, step){
    if (typeof stop === 'undefined'){
        stop = start;
        start = 0;
    }
    if (typeof step === 'undefined'){
        step = 1;
    }
    if ((step > 0 && start >= stop) || (step < 0 && start <= stop)){
        return [];
    }
    var result = [];
    for (var i = start; step > 0 ? i < stop : i > stop; i += step){
        result.push(i);
    }
    return result;
};


exports.address_to_pubkeyhash = function(addr){
    addr = base58.decode(addr);

    if (addr.length != 25){
        console.log('invalid address length for ' + addr);
        throw 'invalid address length';
    }

    if (!addr)
        return null;

    var ver = addr[0];
    var cksumA = addr.slice(-4);
    var cksumB = exports.doublesha(addr.slice(0, -4)).slice(0, 4);

    if (cksumA.toString('hex') != cksumB.toString('hex'))
        throw 'checksum did not match';

    return [ver, addr.slice(1,-4)];
};


/*
 For POS coins - used to format wallet address for use in generation transaction's output
 */
exports.script_to_pubkey = function(key){
    if (key.length === 66) key = new Buffer(key, 'hex');
    if (key.length !== 33) throw 'Invalid address';
    var pubkey = new Buffer(35);
    pubkey[0] = 0x21;
    pubkey[34] = 0xac;
    key.copy(pubkey, 1);
    return pubkey;
};


/*
For POW coins - used to format wallet address for use in generation transaction's output
 */
exports.script_to_address = function(addr){
    var d = exports.address_to_pubkeyhash(addr)
    if (!d)
        throw "invalid address";

    var ver = d[0];
    var pubkeyhash = d[1];
    return Buffer.concat([new Buffer([0x76, 0xa9, 0x14]), pubkeyhash, new Buffer([0x88, 0xac])]);
};