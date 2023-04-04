
#![allow(unused_variables, non_snake_case, dead_code, non_camel_case_types)]

use crate::woff2_reader::*;

pub trait Woff2CampSubTableTrait {
    // fn getSubtable(&mut self) -> bool;
    fn getFormat(&mut self) -> Option<u16>;
    // fn setFormat(&mut self, val: u16);
}

impl Woff2CampSubTableTrait for Woff2CampSubTable0 {
    fn getFormat(self: &mut Woff2CampSubTable0) -> Option<u16> {
        Some(self.format)
    }
}

impl Woff2CampSubTableTrait for Woff2CampSubTable2 {
    fn getFormat(self: &mut Woff2CampSubTable2) -> Option<u16> {
        Some(self.format)
    }
}

impl Woff2CampSubTableTrait for Woff2CampSubTable4 {
    fn getFormat(self: &mut Woff2CampSubTable4) -> Option<u16> {
        Some(self.format)
    }
}

impl Woff2CampSubTableTrait for Woff2CampSubTable6 {
    fn getFormat(self: &mut Woff2CampSubTable6) -> Option<u16> {
        Some(self.format)
    }
}

impl Woff2CampSubTableTrait for Woff2CampSubTable8 {
    fn getFormat(self: &mut Woff2CampSubTable8) -> Option<u16> {
        Some(self.format)
    }
}

impl Woff2CampSubTableTrait for Woff2CampSubTable10 {
    fn getFormat(self: &mut Woff2CampSubTable10) -> Option<u16> {
        Some(self.format)
    }
}

impl Woff2CampSubTableTrait for Woff2CampSubTable12 {
    fn getFormat(self: &mut Woff2CampSubTable12) -> Option<u16> {
        Some(self.format)
    }
}

impl Woff2CampSubTableTrait for Woff2CampSubTable13 {
    fn getFormat(self: &mut Woff2CampSubTable13) -> Option<u16> {
        Some(self.format)
    }
}

impl Woff2CampSubTableTrait for Woff2CampSubTable14 {
    fn getFormat(self: &mut Woff2CampSubTable14) -> Option<u16> {
        Some(self.format)
    }
}
//----------------------------------------------

#[derive(Default)]
pub struct Woff2CampSubTable0 {
    format: u16,
    offset: u16,
    length: u16,
    src_offset: u16,
    src_length: u16,
    language: u16,
}

impl Woff2CampSubTable0 {
    pub fn setFormat(&mut self, val: u16) {
        self.format = val;
    }

    pub fn setOffset(&mut self, val: u16) {
        self.offset = val;
    }
    
    pub fn setLength(&mut self, val: u16) -> bool {
        self.length = val;
        return val > 0;
    }
    
    pub fn setSrc_offset(&mut self, val: u16) {
        self.src_offset = val;
    }
    
    pub fn setSrc_length(&mut self, val: u16) -> bool {
        self.src_length = val;
        return val > 0;
    }

    pub fn setLanguage(&mut self, val: u16) {
        self.language = val;
    } 
}


pub fn subtableType0(subtable: &mut Woff2CampSubTable0, buf: &Vec<u8>, mut cnt: usize) -> bool {
    // let mut cnt: usize = subtable.src_offset as usize + 2;

    subtable.setFormat(0u16);
    
    let length: u16 = ReadUInt16(buf, &mut cnt);
    if !subtable.setLength(length) { return false; }
    subtable.setLanguage(ReadUInt16(buf, &mut cnt));
    subtable.setSrc_offset(cnt as u16);

    if length - 6 != 256 { return false; }
    subtable.setSrc_length(256u16);
    return true;
}

//------------------------------------------------------------

#[derive(Default)]
pub struct Woff2CampSubTable2SubHeader {
    firstCode: u16,
    entryCount: u16,
    idDelta: i16,
    idRangeOffset: u16,
}

#[derive(Default)]
pub struct Woff2CampSubTable2 {
    format: u16,
    offset: u16,
    length: u16,
    key_offset: u16,
    key_length: u16,
    language: u16,
    pub sub_headers: Vec<Woff2CampSubTable2SubHeader>,
}

impl Woff2CampSubTable2 {
    pub fn setFormat(&mut self, val: u16) {
        self.format = val;
    }

    pub fn setOffset(&mut self, val: u16) {
        self.offset = val;
    }
    
    pub fn setLength(&mut self, val: u16) -> bool {
        self.length = val;
        return val > 0;
    }
    
    pub fn setKey_offset(&mut self, val: u16) {
        self.key_offset = val;
    }
    
    pub fn setKey_length(&mut self, val: u16) -> bool {
        self.key_length = val;
        return val > 0;
    }

    pub fn setLanguage(&mut self, val: u16) {
        self.language = val;
    } 
}


pub fn subtableType2(subtable: &mut Woff2CampSubTable2, buf: &Vec<u8>, mut cnt: usize) -> bool {
    // let mut cnt: usize = subtable.src_offset as usize + 2;

    subtable.setFormat(0u16);
    
    let length: u16 = ReadUInt16(buf, &mut cnt);
    if !subtable.setLength(length) { return false; }
    subtable.setLanguage(ReadUInt16(buf, &mut cnt));
    // subtable.setSrc_offset(cnt as u16);

    // if length - 6 != 256 { return false; }
    // subtable.setSrc_length(256);
    return true;
}

#[derive(Default)]
pub struct Woff2CampSubTable4 {
    format: u16,
    offset: u16,
    length: u16,
    src_offset: u32,
    src_length: u32,
    language: u16,
}

#[derive(Default)]
pub struct Woff2CampSubTable6 {
    format: u16,
    offset: u16,
    length: u16,
    src_offset: u32,
    src_length: u32,
    language: u16,
}

#[derive(Default)]
pub struct Woff2CampSubTable8 {
    format: u16,
    offset: u16,
    length: u16,
    src_offset: u32,
    src_length: u32,
    language: u16,
}

#[derive(Default)]
pub struct Woff2CampSubTable10 {
    format: u16,
    offset: u16,
    length: u16,
    src_offset: u32,
    src_length: u32,
    language: u16,
}

#[derive(Default)]
pub struct Woff2CampSubTable12 {
    format: u16,
    offset: u16,
    length: u16,
    src_offset: u32,
    src_length: u32,
    language: u16,
}

#[derive(Default)]
pub struct Woff2CampSubTable13 {
    format: u16,
    offset: u16,
    length: u16,
    src_offset: u32,
    src_length: u32,
    language: u16,
}

#[derive(Default)]
pub struct Woff2CampSubTable14 {
    format: u16,
    offset: u16,
    length: u16,
    src_offset: u32,
    src_length: u32,
    language: u16,
}


pub fn subtableType4(subtable: &mut Woff2CampSubTable4, buf: &Vec<u8>, mut cnt: usize) -> bool {
    // let mut cnt: usize = subtable.src_offset as usize + 2;
    
    // subtable.setFormat(2u16);

    return true;
}

pub fn subtableType6(subtable: &mut Woff2CampSubTable6, buf: &Vec<u8>, mut cnt: usize) -> bool {
    // let mut cnt: usize = subtable.src_offset as usize + 2;
    
    // subtable.setFormat(2u16);

    return true;
}

pub fn subtableType8(subtable: &mut Woff2CampSubTable8, buf: &Vec<u8>, mut cnt: usize) -> bool {
    // let mut cnt: usize = subtable.src_offset as usize + 2;
    
    // subtable.setFormat(2u16);

    return true;
}

pub fn subtableType10(subtable: &mut Woff2CampSubTable10, buf: &Vec<u8>, mut cnt: usize) -> bool {
    // let mut cnt: usize = subtable.src_offset as usize + 2;
    
    // subtable.setFormat(2u16);

    return true;
}

pub fn subtableType12(subtable: &mut Woff2CampSubTable12, buf: &Vec<u8>, mut cnt: usize) -> bool {
    // let mut cnt: usize = subtable.src_offset as usize + 2;
    
    // subtable.setFormat(2u16);

    return true;
}

pub fn subtableType13(subtable: &mut Woff2CampSubTable13, buf: &Vec<u8>, mut cnt: usize) -> bool {
    // let mut cnt: usize = subtable.src_offset as usize + 2;
    
    // subtable.setFormat(2u16);

    return true;
}

pub fn subtableType14(subtable: &mut Woff2CampSubTable14, buf: &Vec<u8>, mut cnt: usize) -> bool {
    // let mut cnt: usize = subtable.src_offset as usize + 2;
    
    // subtable.setFormat(2u16);

    return true;
}