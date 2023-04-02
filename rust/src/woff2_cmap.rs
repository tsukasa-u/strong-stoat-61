
#![allow(unused_variables, non_snake_case, dead_code, non_camel_case_types)]

fn getSubtableFormatTypeList() -> Vec<u16> {
    return vec![0u16, 2u16, 4u16, 6u16, 8u16, 10u16, 12u16, 13u16, 14u16];
}

#[derive(Default)]
pub struct Woff2CampSubTable {
    format: u16,
    offset: u16,
    length: u16,
    src_offset: u32,
    src_length: u32,
    language: u16,
}

impl Woff2CampSubTable {
    pub fn setFormat(&mut self, val: u16) -> bool {
        self.format = val;
        return true;
    }

    pub fn setOffset(&mut self, val: u16) {
        self.offset = val;
    }
    
    pub fn setLength(&mut self, val: u16) -> bool {
        self.offset = val;
        return val > 0;
    }
    
    pub fn setSrc_offset(&mut self, val: u16) {
        self.offset = val;
    }
    
    pub fn setSrc_length(&mut self, val: u16) -> bool {
        self.offset = val;
        return val > 0;
    }

    pub fn setLanguage(&mut self, val: u16) {
        self.language = val;
    } 

    pub fn getFormat(&self) -> Option<u16> {
        Some(self.format)
    }
}

#[derive(Default)]
pub struct Woff2EncodingRecord {
    platformID: u16,
    encodingID: u16,
    subtableOffset: u32,
    pub subtable: Woff2CampSubTable,
    formatType: u16,
}

impl Woff2EncodingRecord {
    pub fn setPlatformID(&mut self, val:u16) {
        self.platformID = val;
    }

    pub fn setEncodingID(&mut self, val: u16) {
        self.encodingID = val;
    }

    pub fn setSubtableOffset(&mut self, val: u32) {
        self.subtableOffset = val;
    }

    pub fn computeFormatType(&mut self) -> bool {
        if self.platformID == 0 {
            // if encodingRecord.encodingID == 0 || encodingRecord.encodingID == 1 || encodingRecord.encodingID == 2 { return false; }
            self.formatType = match self.encodingID {
                3 => (1 << 4) | (1 << 6),
                4 => (1 << 10) | (1 << 12),
                5 => 1 << 14,
                6 => 1 << 13,
                _ => return false
            };
        } else if self.platformID == 1 {
            //  Macintosh Platform
            //  Go to name
            return false;
        } else if self.platformID == 2 {
            self.formatType = match self.encodingID {
                0 => 1,
                1 => 1,
                2 => 1,
                _ => return false
            };
        } else if self.platformID == 3 {
            self.formatType = match self.encodingID {
                0 => 1 << 4,
                1 => 1 << 4,
                2 => 0,
                3 => 0,
                4 => 0,
                5 => 0,
                6 => 0,
                7 => 0,
                8 => 0,
                9 => 0,
                10 => 1 << 12,
                _ => return false
            };
        } else if self.encodingID == 4 {
            self.formatType = (1 << 0) | (1 << 6);
            // return false;
        } else {
            return false;
        }
        return true;
    }

    pub fn getFormatType(&self) -> Option<u16> {
        Some(self.formatType)
    }

    pub fn checkFormatType(&self) -> bool {
        let format_type = self.subtable.getFormat().unwrap();
        return self.getFormatType().unwrap() == format_type && getSubtableFormatTypeList().contains(&format_type)
    }
}

#[derive(Default)]
pub struct Woff2Cmap {
    version: u16,
    numTables: u16,
    encodingRecords: Vec<Woff2EncodingRecord>,
}

impl Woff2Cmap {
    pub fn setVersion(&mut self, val:u16) {
        self.version = val;
    }

    pub fn setNumtables(&mut self, val: u16) -> bool {
        self.numTables = val;
        return val > 0;
    }

    pub fn setEncodingRecords(&mut self, val: Woff2EncodingRecord) {
        self.encodingRecords.push(val);
    }
}

fn subtableType0() -> bool {
    return true;
}

fn subtableType2() -> bool {
    return true;
}

fn subtableType4() -> bool {
    return true;
}

fn subtableType6() -> bool {
    return true;
}


fn subtableType8() -> bool {
    return true;
}


fn subtableType10() -> bool {
    return true;
}


fn subtableType12() -> bool {
    return true;
}

fn subtableType13() -> bool {
    return true;
}

fn subtableType14() -> bool {
    return true;
}