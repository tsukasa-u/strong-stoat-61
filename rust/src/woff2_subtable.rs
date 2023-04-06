
#![allow(unused_variables, non_snake_case, dead_code, non_camel_case_types)]

use crate::woff2_reader::*;
use std::collections::HashMap;

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
pub struct CharMap<T> {
    offset: u32,
    character: T,
    // bytes: u8,
    glyhId: T,
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
    pub hashTable: HashMap<u16, CharMap<u8>>
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
    
    for i in 0..256 {
        subtable.hashTable.insert(i, CharMap { offset: cnt as u32, character: i as  u8, glyhId: buf[cnt] });
    }

    return true;
}

//------------------------------------------------------------

#[derive(Default)]
pub struct Woff2CampSubTable2SubHeader {
    offset: u32,
    firstCode: u16,
    entryCount: u16,
    idDelta: i16,
    idRangeOffset: u16,
}

impl Woff2CampSubTable2SubHeader {
    pub fn getFirstCode(&self) -> Option<u16> {
        Some(self.firstCode)
    }

    pub fn getEntryCount(&self) -> Option<u16> {
        Some(self.entryCount)
    }

    pub fn getIdDelta(&self) -> Option<i16> {
        Some(self.idDelta)
    }
    
    pub fn getIdRangeOffset(&self) -> Option<u16> {
        Some(self.idRangeOffset)
    }
    
    pub fn getOffset(&self) -> Option<u32> {
        Some(self.offset)
    }
}

#[derive(Default)]
pub struct Woff2CampSubTable2 {
    format: u16,
    offset: u16,
    length: u16,
    key_offset: u16,
    key_length: u16,
    keys: Vec<u16>,
    language: u16,
    pub sub_headers: Vec<Option<Woff2CampSubTable2SubHeader>>,
    pub hashTable: HashMap<u16, CharMap<u16>>
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
    
    pub fn setKeys(&mut self, val: u16) {
        self.keys.push(val);
    }

    pub fn getKeys(&mut self, val: usize) -> Option<&u16> {
        self.keys.get(val)
    }
    
    pub fn getKey_offset(&mut self) -> u16 {
        self.key_offset
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

    subtable.setKey_offset(cnt as u16);
    subtable.setKey_length(256u16);

    let mut max: u16 = 0;
    for i in 0..256 {
        let mut tmp: u16 = ReadUInt16(buf, &mut cnt);
        subtable.setKeys(tmp);
        tmp /= 8;
        if max < tmp {
            max = tmp;
        }
    }
    subtable.sub_headers = Vec::with_capacity(max.into());

    
    for i in 0..max as usize {
        // let tmp: u16 = cnt + 6;
        
        let offset: u32 = cnt as u32;
        let firstCode: u16 = ReadUInt16(buf, &mut cnt);
        let entryCount: u16 = ReadUInt16(buf, &mut cnt);
        let idDelta: i16 = ReadInt16(buf, &mut cnt);
        let idRangeOffset: u16 = ReadUInt16(buf, &mut cnt);
        let element: Woff2CampSubTable2SubHeader = Woff2CampSubTable2SubHeader {
            offset: offset,
            firstCode: firstCode,
            entryCount: entryCount,
            idDelta: idDelta,
            idRangeOffset: idRangeOffset,
        };
        subtable.sub_headers[i] = Some(element);
    }
    
    for i in 0..256 {
        match &subtable.sub_headers[i] {
            Some(ele) => {
                let offset: u32 = ele.getOffset().unwrap();
                let firstCode: u16 = ele.getFirstCode().unwrap();
                let entryCount: u16 = ele.getEntryCount().unwrap();
                let idDelta: i16 = ele.getIdDelta().unwrap();
                let idRangeOffset: u16 = ele.getIdRangeOffset().unwrap();
                
                if subtable.getKeys(i).unwrap()/8 > 0 {
                    for j in 0..entryCount {
                        let tmp: usize = offset as usize + idRangeOffset as usize + (j*2) as usize;
                        let mut p: u16 = ((buf[tmp] as u16) << 8) | (buf[tmp + 1] as u16);
                        p = if p != 0 { (p as i16 + idDelta) as u16 } else { p };
                        let character: u16 = ((i as u16) << 8) | (j + firstCode);
                        subtable.hashTable.insert(character, CharMap { offset: tmp as u32, character: character, glyhId: p });
                    }
                } else {
                    for j in 0..entryCount {
                        let tmp: usize = offset as usize + idRangeOffset as usize + (j*2) as usize;
                        let p: u16 = ((buf[tmp] as u16) << 8) | (buf[tmp + 1] as u16);
                        let character: u16 = ((i as u16) << 8) | j;
                        subtable.hashTable.insert(character, CharMap { offset: tmp as u32, character: character, glyhId: p });
                    }
                }
            },
            None => (),
        };
    }
    return true;
}

#[derive(Default)]
pub struct Woff2CampSubTable4 {
    format: u16,
    offset: u16,
    length: u16,
    language: u16,
    segCountX2: u16,
    searchRange: u16,
    entrySelector: u16,
    rangeShift: u16,
    endCode: Vec<u16>,
    reservePad: u16,
    startCode: Vec<u16>,
    idDelta: Vec<u16>,
    idRangeOffsets: Vec<u16>,
    pub hashTable: HashMap<u16, CharMap<u16>>
}

impl Woff2CampSubTable4 {
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

    pub fn setLanguage(&mut self, val: u16) {
        self.language = val;
    }

    pub fn setSegCountX2(&mut self, val:u16) -> bool {
        self.segCountX2 = val;
        return val > 0;
    }

    pub fn setSearchRange(&mut self, val:u16) -> bool {
        self.segCountX2 = val;
        return (2f32.powf((self.segCountX2 as f32/2f32).log2().floor())*2f32 - val as f32).abs() < 1e-3;
    }

    pub fn setEntrySelector(&mut self, val: u16) -> bool {
        self.searchRange = val;
        return (((self.segCountX2 as f32)/2f32).log2().floor() - val as f32).abs() < 1e-3;
    }

    pub fn setRangeShift(&mut self, val: u16) -> bool {
        self.entrySelector = val;
        return val == self.segCountX2 - self.searchRange;
    }

    pub fn setEndCode(&mut self, val: u16) {
        self.endCode.push(val);
    }
    
    pub fn setReservePad(&mut self, val:u16) -> bool {
        self.reservePad = val;
        return val == 0;
    }

    pub fn setStartCode(&mut self, val: u16) {
        self.startCode.push(val);
    }
    
    pub fn setIdDelta(&mut self, val: u16) {
        self.idDelta.push(val);
    }

    pub fn setIdRangeOffsets(&mut self, val: u16) {
        self.idRangeOffsets.push(val);
    }
}

pub fn subtableType4(subtable: &mut Woff2CampSubTable4, buf: &Vec<u8>, mut cnt: usize) -> bool {
    // let mut cnt: usize = subtable.src_offset as usize + 2;
    
    // subtable.setFormat(2u16);

    return true;
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