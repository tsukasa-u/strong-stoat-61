
#![allow(unused_variables, non_snake_case, dead_code)]

pub(crate) fn Read255UInt16 ( data: &[u8], cnt: &mut usize) -> u16 {
    let mut i: usize = *cnt;
    let mut code: u8;
    let mut value: u16;
    let mut value2: u16;

    let oneMoreByteCode1: u8    = 255;
    let oneMoreByteCode2: u8    = 254;
    let wordCode: u8            = 253;
    let lowestUCode: u16        = 253;

    // code = data.getNextUInt8();
    code = data[i]; i += 1;
    if code == wordCode {
        /* Read two more bytes and concatenate them to form UInt16 value*/
        // value = data.getNextUInt8();
        value = data[i] as u16; i += 1;
        value <<= 8;
        value &= 0xff00;
        // value2 = data.getNextUInt8();
        value2 = data[i] as u16; i += 1;
        value |= value2 & 0x00ff;
    } else if code == oneMoreByteCode1 {
        // value = data.getNextUInt8();
        value = data[i] as u16; i += 1;
        value = value + lowestUCode;
    } else if code == oneMoreByteCode2 {
        // value = data.getNextUInt8();
        value = data[i] as u16; i += 1;
        value = value + lowestUCode*2;
    } else {
        value = code as u16;
    }
    *cnt += 2;
    return value;
}

pub(crate) fn ReadUIntBase128( data: &[u8], result: &mut u32, cnt: &mut usize) -> bool {
    let mut accum: u32 = 0;

    for i in (*cnt)..(*cnt+5) {
        // let data_byte: u8 = data.getNextUInt8();
        let data_byte: u8 = data[i];

        // No leading 0's
        if i == 0 && data_byte == 0x80 {
            return false;
        }

        // If any of top 7 bits are set then << 7 would overflow
        if accum & 0xFE000000 > 0 {
            return false;
        }

        // *accum = (accum << 7) | (data_byte & 0x7F);
        accum = (accum << 7) | (data_byte & 0x7F > 0) as u32;

        // Spin until most significant bit of data byte is false
        if data_byte & 0x80 == 0 {
            *result = accum;
            *cnt += 4;
            return true;
        }
    }
    // UIntBase128 sequence exceeds 5 bytes
    return false;
}

pub(crate) fn ReadUInt8(data: &[u8], cnt: &mut usize) -> u8 {
    let a1: u8 = data[*cnt];
    *cnt += 1;
    return a1;
}

pub(crate) fn ReadInt16(data: &[u8], cnt: &mut usize) -> i16 {
    let a1: i32 = data[*cnt] as i32;
    let a2: i32 = data[*cnt + 1] as i32;
    *cnt += 2;
    return ((a1 << 8) | a2) as i16;
}

pub(crate) fn ReadUInt16(data: &[u8], cnt: &mut usize) -> u16 {
    let a1: u32 = data[*cnt] as u32;
    let a2: u32 = data[*cnt + 1] as u32;
    *cnt += 2;
    return ((a1 << 8) | a2) as u16;
}

pub(crate) fn ReadUInt32(data: &[u8], cnt: &mut usize) -> u32 {
    let a1: u32 = data[*cnt] as u32;
    let a2: u32 = data[*cnt + 1] as u32;
    let a3: u32 = data[*cnt + 2] as u32;
    let a4: u32 = data[*cnt + 3] as u32;
    *cnt += 4;
    return ((a1 << 32) | (a2 << 16) | (a3 << 8) | a4) as u32;
}

pub(crate) fn skip(cnt: &mut usize, val: usize) {
    *cnt += val;
}