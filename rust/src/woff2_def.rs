use std::{sync::mpsc::RecvTimeoutError, error::Error};

pub const kLocaTableTag: u32 = 0x6c6f6361;
pub const kWoff2FlagsTransform: u32 = 1 << 8;
pub enum knownTableTags{
    cmap, head, hhea, hmtx, maxp, name, OS_2, post, cvt	, glyf, loca, prep, CFF	, VORG, EBDT,
    EBLC, gasp, hdmx, kern, LTSH, PCLT, VDMX, vhea, vmtx, BASE, GDEF, GPOS, GSUB, EBSC, JSTF, MATH,
    CBDT, CBLC, COLR, CPAL, SVG , sbix, acnt, avar, bdat, bloc, bsln, cvar, fdsc, feat, fmtx, fvar,
    gvar, hsty, just, lcar, mort, morx, opbd, prop, trak, Zapf, Silf, Glat, Gloc, Feat, Sill
}

#[derive(Default)]
pub struct Woff2Header {
    signature: u32,
    flavor: u32,
    length: u32,
    numTables: u16,
    reserved: u16,
    totalSfntSize: u32,
    totalCompressedSize: u32,
    majorVersion: u16,
    minorVersion: u16,
    metaOffset: u32,
    metaLength: u32,
    metaOrigLength: u32,
    privOffset: u32,
    privLength: u32,
}

impl Woff2Header {
    pub fn setSignature(&mut self, val:u32) -> bool {
        self.signature = val;
        return 0x774F4632 == val;
    }
    
    pub fn setFlavor(&mut self, val:u32) {
        self.flavor = val;
    }
    
    pub fn setLength(&mut self, val:u32) -> bool {
        self.length = val;
        return val > 0;
    }
    
    pub fn setNumTables(&mut self, val:u16) -> bool {
        self.numTables = val;
        return val > 0;
    }

    pub fn setReserved(&mut self, val:u16) {
        self.reserved = val;
    }

    pub fn SetTotalSfntSize(&mut self, val: u32) -> bool {
        self.totalSfntSize = val;
        return val > 0;
    }

    pub fn setTotalCompressedSize(&mut self, val: u32) -> bool {
        self.totalCompressedSize = val;
        return val > 0;
    }
    
    pub fn setMajorVersion(&mut self, val: u16) {
        self.majorVersion = val;
    }

    pub fn setMinorVersion(&mut self, val: u16) {
        self.minorVersion = val;
    }

    pub fn setMetaOffset(&mut self, val: u32) -> bool {
        self.metaOffset = val;
        return val > 0;
    }

    pub fn setMetaLength(&mut self, val: u32) -> bool {
        self.metaLength = val;
        return val > 0;
    }

    pub fn setMetaOrigLength(&mut self, val: u32) -> bool {
        self.metaOrigLength = val;
        return val > 0;
    }

    pub fn setPrivOffset(&mut self, val: u32) -> bool {
        self.privOffset = val;
        return val > 0;
    }

    pub fn setPrivLength(&mut self, val:u32) -> bool {
        self.privLength = val;
        return val > 0;
    }

    pub fn checkMetaLength(&self) -> bool {
        return self.metaOffset >= self.length || self.length - self.metaOffset < self.metaLength;
    }
    
    pub fn checkPrivLength(&self) -> bool {
        return self.privOffset >= self.length || self.length - self.privOffset < self.privLength;
    }

    pub fn getSignature(&self) -> Option<u32> {
        match self.signature {
            0 => None,
            x => Some(x)
        }
    }
    
    pub fn getFlavor(&self) -> Option<u32> {
        Some(self.flavor)
    }

    pub fn getLength(&self) -> Option<u32> {
        match self.length {
            0 => None,
            x => Some(x)
        }
    }
    
    pub fn getNumTables(&self) -> Option<u16> {
        match self.numTables {
            0 => None,
            x => Some(x)
        }
    }

    pub fn getReserved(&self) -> Option<u16> {
        Some(self.reserved)
    }

    pub fn getTotalSfntSize(&self) -> Option<u32> {
        match self.totalSfntSize {
            0 => None,
            x => Some(x)
        }
    }
    
    pub fn getTotalCompressedSize(&self) -> Option<u32> {
        match self.totalCompressedSize {
            0 => None,
            x => Some(x)
        }
    }

    pub fn getMajorVersion(&self) -> Option<u16> {
        Some(self.majorVersion)
    }

    pub fn getMinorVersion(&self) -> Option<u16> {
        Some(self.minorVersion)
    }
    
    pub fn getMetaOffset(&self) -> Option<u32> {
        match self.metaOffset {
            0 => None,
            x => Some(x)
        }
    }
    
    pub fn getMetaLength(&self) -> Option<u32> {
        match self.metaLength {
            0 => None,
            x => Some(x)
        }
    }
    
    pub fn getMetaOrigLength(&self) -> Option<u32> {
        match self.metaOrigLength {
            0 => None,
            x => Some(x)
        }
    }
    
    pub fn getPrivOffset(&self) -> Option<u32> {
        match self.privOffset {
            0 => None,
            x => Some(x)
        }
    }
    
    pub fn getPrivLength(&self) -> Option<u32> {
        match self.privLength {
            0 => None,
            x => Some(x)
        }
    }
}

#[derive(Default)]
pub struct Woff2Table {
    src_offset: u32,
    src_length: u32,
    tag: u8,
    exTag: u32,
    flags: u8,
    transformLength: u32,
    origLength: u32,
    transformationVersion: u8,
}

impl Woff2Table {
    pub fn setSrc_offset(&mut self, val: u32) {
        self.src_offset = val;
    }

    pub fn setSrc_length(&mut self, val:u32) -> bool {
        self.src_length = val;
        return val > 0;
    }

    pub fn setTag(&mut self) {
        self.tag = self.flags & 0x3f;
    }

    pub fn setExTag(&mut self, val: u32) {
        self.exTag = val;
    }

    pub fn setFlags(&mut self, val: u8) -> bool {
        self.flags = val;
        if val != 0 {
            self.setTag();
            self.setTransformationVersion();
            return true;
        } else {
            return false;
        }
    }

    pub fn setTransformLength(&mut self, val: u32) -> bool {
        self.transformLength = val;
        return val > 0;
    }
    
    pub fn setOrigLength(&mut self, val: u32) -> bool {
        self.origLength = val;
        return val > 0;
    }

    pub fn setTransformationVersion(&mut self) {
        self.transformationVersion = (self.flags >> 6) & 0x03;
    }

    pub fn checkTagEx(&self) -> bool {
        return self.tag == 0x3f;
    }

    pub fn getTag(&self) -> Option<u8> {
        Some(self.tag)
    }

    pub fn getSrc_offset(&self) -> Option<u32> {
        match self.src_offset {
            0 => None,
            x => Some(x),
        }
    }

    pub fn getSrc_length(&self) -> Option<u32> {
        match self.src_length {
            0 => None,
            x => Some(x),
        }
    }

    pub fn getTransformationVersion(&self) -> Option<u8> {
        Some(self.transformationVersion)
    }
}

#[derive(Default)]
pub struct Woff2FontEntry {
    numTables: u16,
    flavor: u32,
    index: Vec<u16>,
}

impl Woff2FontEntry {
    pub fn setNumtables(&mut self, val: u16) -> bool {
        self.numTables = val;
        return val > 0
    }

    pub fn setFlavor(&mut self, val: u32) {
        self.flavor = val;
    }

    pub fn setIndex(&mut self, val: u16) {
        self.index.push(val);
    }

    pub fn getIndex_ref(&self) -> &Vec<u16> {
        return &self.index;
    }
}

#[derive(Default)]
pub struct Woff2Collection {
    version: u32,
    numFonts: u16,
    FontEntrys: Vec<Woff2FontEntry>,
}

impl Woff2Collection {
    pub fn serVersion(&mut self, val: u32) -> bool {
        self.version = val;
        return val != 0x00010000 && val != 0x00020000; 
    }

    pub fn setNumFonts(&mut self, val: u16) -> bool {
        self.numFonts = val;
        return val > 0;
    }

    pub fn setFontEntrys(&mut self, val: Woff2FontEntry) {
        self.FontEntrys.push(val);
    }

    pub fn getFontEntrys_ref(&self) -> &Vec<Woff2FontEntry> {
        return &self.FontEntrys;
    }
}

#[derive(Default)]
pub struct Woff2CampSubTable {
    format: u16,
    offset: u16,
    length: u16,
    src_offset: u32,
    src_length: u32,
}

impl Woff2CampSubTable {
    pub fn setFormat(&mut self, val: u16) -> bool {
        self.format = val;
        return true;
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
    subtable: Woff2CampSubTable,
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
        return self.getFormatType().unwrap() == self.subtable.getFormat().unwrap();
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
