
#![allow(unused_variables, non_snake_case, dead_code, non_camel_case_types)]

// use std::io::Read;
// use std::io::Write;
use brotli;
use rand::seq::SliceRandom;

use crate::woff2_reader::*;
use crate::woff2_def::*;
use crate::woff2_cmap::*;

fn getWOFF2Hedder(data: &[u8], cnt: &mut usize, header: &mut Woff2Header) -> bool {
    
    // UInt32	signature	0x774F4632 'wOF2'
    // let signature: u32 = ReadUInt32(data, cnt);
    // if signature != 0x774F4632 { return false; }
    if !header.setSignature(ReadUInt32(data, cnt)) { return false; }

    // UInt32	flavor	The "sfnt version" of the input font.
    // let flavor: u32 = ReadUInt32(data, cnt);
    header.setFlavor(ReadUInt32(data, cnt));

    // UInt32	length	Total size of the WOFF file.
    // let length: u32 = ReadUInt32(data, cnt);
    // if length == 0 { return false; }

    // UInt16	numTables	Number of entries in directory of font tables.
    // let numTables: u16 = ReadUInt16(data, cnt);
    // if numTables == 0 { return false; }
    if !header.setNumTables(ReadUInt16(data, cnt)) { return false; }
    
    // UInt16	reserved	Reserved; set to 0.
    // let reserved: u16 = ReadUInt16(data, cnt);
    header.setReserved(ReadUInt16(data, cnt));

    // UInt32	totalSfntSize	Total size needed for the uncompressed font data, including the sfnt header, directory, and font tables (including padding).
    // let totalSfntSize: u32 = ReadUInt32(data, cnt);
    if !header.SetTotalSfntSize(ReadUInt32(data, cnt)) { return false; }

    // UInt32	totalCompressedSize	Total length of the compressed data block.
    // let totalCompressedSize: u32 = ReadUInt32(data, cnt);
    if !header.setTotalCompressedSize(ReadUInt32(data, cnt)) { return false; }

    // UInt16	majorVersion	Major version of the WOFF file.
    // let majorVersion: u16 = ReadUInt16(data, cnt);
    header.setMajorVersion(ReadUInt16(data, cnt));

    // UInt16	minorVersion	Minor version of the WOFF file.
    // let minorVersion: u16 = ReadUInt16(data, cnt);
    header.setMinorVersion(ReadUInt16(data, cnt));

    // UInt32	metaOffset	Offset to metadata block, from beginning of WOFF file.
    // let metaOffset: u32 = ReadUInt32(data, cnt);
    // if metaOffset == 0 { return false; }
    if !header.setMetaOffset(ReadUInt32(data, cnt)) { return false; }

    // UInt32	metaLength	Length of compressed metadata block.
    // let metaLength: u32 = ReadUInt32(data, cnt);
    // if metaLength == 0 { return false; }
    if !header.setMetaLength(ReadUInt32(data, cnt)) { return false; }

    // UInt32	metaOrigLength	Uncompressed size of metadata block.
    // let metaOrigLength: u32 = ReadUInt32(data, cnt);
    // if metaOrigLength == 0 { return false; }
    if !header.setMetaOrigLength(ReadUInt32(data, cnt)) { return false; }

    // if !(metaOffset >= length || length - metaOffset < metaLength) { return false; }
    if !header.checkMetaLength() { return false; }

    // UInt32	privOffset	Offset to private data block, from beginning of WOFF file.
    // let privOffset: u32 = ReadUInt32(data, cnt);
    // if privOffset == 0 { return false; }
    if !header.setPrivOffset(ReadUInt32(data, cnt)) { return false; }

    // UInt32	privLength	Length of private data block.
    // let privLength: u32 = ReadUInt32(data, cnt);
    // if privLength == 0 { return false; }
    if !header.setPrivLength(ReadUInt32(data, cnt)) { return false; }

    // if !(privOffset >= length || length - privOffset < privLength) { return false; }

    if !header.checkPrivLength() {return false; }

    // (*header).signature = signature;
    // (*header).flavor = flavor;
    // (*header).length = length;
    // (*header).numTables = numTables;
    // (*header).reserved = reserved;
    // (*header).totalSfntSize = totalCompressedSize;
    // (*header).totalCompressedSize = totalCompressedSize;
    // (*header).majorVersion = majorVersion;
    // (*header).minorVersion = minorVersion;
    // (*header).metaOffset = metaOffset;
    // (*header).metaLength = metaLength;
    // (*header).metaOrigLength = metaOrigLength;
    // (*header).privOffset = privOffset;
    // (*header).privLength = privLength;

    return true;
}

fn getWOFF2TableDirectory(data: &[u8], cnt: &mut usize, tables: &mut Vec::<Woff2Table>, num_tables: usize) -> u32 {

    let mut src_offset: u32 = 0;
    for i in 0..num_tables {

        let mut table: &mut Woff2Table = &mut (*tables)[i];

        // UInt8	flags	table type and flags
        // let flags: u8 = ReadUInt8(data, cnt);
        // if flags == 0 { return 0; };
        if !table.setFlags(ReadUInt8(data, cnt)) { return 0; }

        // let knownTag: u8 = flags & 0x3f;
        // let transformationVersion: u8 = (flags >> 6) & 0x03;

        // let mut tag = knownTag;
        if table.checkTagEx() {
            // UInt32	tag	4-byte tag (optional)
            table.setExTag(ReadUInt32(data, cnt));
        }

        let mut _flags: u32 = 0;
        // if (knownTableTags::glyf as u8).eq(table.getTag().as_ref().unwrap()) || (knownTableTags::loca as u8).eq(table.getTag().as_ref().unwrap()) {
        if (knownTableTags::glyf as u8 == table.getTag().unwrap()) || knownTableTags::loca as u8 == table.getTag().unwrap() {
            if table.getTransformationVersion().unwrap() == 0 {
                _flags |= kWoff2FlagsTransform;
            }
        } else if table.getTransformationVersion().unwrap() != 0 {
            _flags |= kWoff2FlagsTransform;
        }
        _flags |= table.getTransformationVersion().unwrap() as u32;

        // UIntBase128	origLength	length of original table
        let mut origLength: u32 = 0;
        ReadUIntBase128(data, &mut origLength, cnt);
        // if origLength == 0 { return 0; }
        if !table.setOrigLength(origLength) { return 0; }


        // The transformLength field is present in the table directory entry if, and only if, the table has been processed by a non-null transform prior to Brotli compression.
        // UIntBase128	transformLength	transformed length (if applicable)
        let mut transformLength: u32 = origLength;
        if (_flags & kWoff2FlagsTransform) != 0 {
            ReadUIntBase128(data, &mut transformLength, cnt);
            table.setTransformLength(transformLength);

            if table.getTag().unwrap() == knownTableTags::loca as u8 && transformLength > 0 { return 0; }
        }
        // if src_offset + transformLength < src_offset { return 0; }
        table.setSrc_offset(src_offset.clone());
        table.setSrc_length(transformLength);
        src_offset += transformLength;

        // (*table).tag = tag;
        ////// (*table)._flags = _flags;
        // (*table).transformLength = transformLength;
        // (*table).origLength = origLength;
    }
    *cnt += src_offset as usize;
    return src_offset;
}

fn isWOFF2CollectionDirectory(header: Woff2Header) -> bool {
    return header.getFlavor().unwrap() == 0x74746366;
}

fn getWOFF2CollectionDirectory(data: &[u8], cnt: &mut usize, collections: &mut Woff2Collection) -> bool {

    // UInt32	version	The Version of the TTC Header in the original font.
    // let version: u32 = ReadUInt32(data, cnt);
    // if version != 0x00010000 && version != 0x00020000 { return false; }
    // (*collections).version = version;
    collections.serVersion(ReadUInt32(data, cnt));

    // 255UInt16	numFonts	The number of fonts in the collection.
    let numFonts: u16 = ReadUInt16(data, cnt);
    // if numFonts == 0 { return false; };
    // (*collections).numFonts = numFonts;
    collections.setNumFonts(numFonts);
    //-----------

    for j in 0..numFonts {
        let mut fontEntry: Woff2FontEntry = Default::default();

        // 255UInt16	numTables	The number of tables in this font
        let numTables: u16 = ReadUInt16(data, cnt);
        // if numTables == 0 { return false; }
        // fontEntry.numTables = numTables as u16;
        if !fontEntry.setNumtables(numTables) {return false; }
    
        // UInt32	flavor	The "sfnt version" of the font
        // let flavor: u32 = ReadUInt32(data, cnt);
        // fontEntry.flavor = flavor;
        fontEntry.setFlavor(ReadUInt32(data, cnt));
    
        // 255UInt16	index[numTables]	The index identifying an entry in the Table Directory for each table in this font (where the index of the first Table Directory entry is zero.)
        // 
        for i in 0..numTables {
            fontEntry.setIndex(Read255UInt16(data, cnt));
        }
        // collections.FontEntrys.push(fontEntry);
        collections.setFontEntrys(fontEntry);
    }

    return true;
}

fn checkLocaGlyf(tables: &Vec<Woff2Table>, collections: &Woff2Collection) -> bool {

    for fontEntry in collections.getFontEntrys_ref() {
        let mut loca_index: u16 = 0;
        let mut glyf_index: u16 = 0;
        for index in fontEntry.getIndex_ref() {
            let table: &Woff2Table = &(*tables)[*index as usize];
            if table.getTag().unwrap() == knownTableTags::loca as u8 {
                loca_index = *index;
            }
            if table.getTag().unwrap() == knownTableTags::glyf as u8 {
                glyf_index = *index;
            }
        }
        if glyf_index > 0 || loca_index > 0 {
            if glyf_index > loca_index || loca_index - glyf_index != 1 { return false; }
        }
    }
    return true;
}

fn WoffDecompress(data: &[u8], check_format: u32) -> bool {

    let mut header: Woff2Header = Default::default();
    let mut cnt: usize = 0;

    // --------------------------------begin Read --------------------------------

    if !getWOFF2Hedder(data, &mut cnt, &mut header) {return false;}


    let mut tables: Vec<Woff2Table> = Vec::with_capacity(header.getNumTables().unwrap().into());

    let uncompressed_size: u32 = getWOFF2TableDirectory(data, &mut cnt, &mut tables, header.getNumTables().unwrap().into());
    if uncompressed_size == 0 { return false; }

    let mut collections: Woff2Collection = Default::default();

    if isWOFF2CollectionDirectory(header) {
        if !getWOFF2CollectionDirectory(data, &mut cnt, &mut collections) { return false; }
    }

    if !checkLocaGlyf(&tables, &collections) { return false; }

    // --------------------------------end Read --------------------------------

    // --------------------------------brotli Decompress --------------------------------
    // --------------------------------begin brotli Decompress --------------------------------
    let compressed_offset: usize = cnt;
    let mut src_buf: &[u8] = &data[compressed_offset..data.len()];
    let mut uncompressed_buf: Vec<u8> = Vec::with_capacity(uncompressed_size.try_into().unwrap());
    match brotli::BrotliDecompress(&mut src_buf, &mut uncompressed_buf) {
        Ok(_) => {},
        Err(e) => panic!("Error {:?}", e),
    }
    // --------------------------------end brotli Decompress --------------------------------
    // --------------------------------begin cmap --------------------------------
    let mut cmap: Woff2Cmap = Default::default();
    for table in tables {
        if table.getTag().unwrap() == knownTableTags::cmap as u8 {
            // let pre_cmap_buf: Vec<u8> = uncompressed_buf[..(table.src_offset as usize)].into();
            // let mut cmap_buf: &[u8] = &uncompressed_buf[(table.src_offset as usize)..((table.src_offset + table.src_length) as usize)];
            // let post_cmap_buf: Vec<u8> = uncompressed_buf[((table.src_offset + table.src_length) as usize)..].into();
            
            // let mut _cnt: usize = 0;
            let mut _cnt: usize = table.getSrc_offset().unwrap() as usize;
            // cmap.version = ReadUInt16(cmap_buf, &mut _cnt);
            cmap.setVersion(ReadUInt16(&uncompressed_buf, &mut _cnt));

            // cmap.numTables = ReadUInt16(cmap_buf, &mut _cnt);
            let numTables: u16 = ReadUInt16(&uncompressed_buf, &mut _cnt);
            // if cmap.numTables == 0 { return false; }
            cmap.setNumtables(ReadUInt16(&uncompressed_buf, &mut _cnt));

            for index in 0..numTables {
                let mut encodingRecord: Woff2EncodingRecord = Default::default();

                encodingRecord.setPlatformID(ReadUInt16(&uncompressed_buf, &mut _cnt));
                encodingRecord.setEncodingID(ReadUInt16(&uncompressed_buf, &mut _cnt));
                encodingRecord.setSubtableOffset(ReadUInt32(&uncompressed_buf, &mut _cnt));

                if check_format & 0x01 == 1  {
                    if !encodingRecord.computeFormatType() { return false; }
                }
                // let format_type: u32 = encodingRecord.getFormatType().unwrap();

                // encodingRecord.

                encodingRecord.subtable.setOffset(_cnt.clone() as u16);

                if !encodingRecord.subtable.setFormat(ReadUInt16(&uncompressed_buf, &mut _cnt)) { return false; }
        
                if check_format & 0x01 == 1  {
                    if !encodingRecord.checkFormatType() { return false;}
                }

                // if !encodingRecord.subtable.setLength(ReadUInt16(&uncompressed_buf, &mut _cnt)) { return false; }
                
                // encodingRecord.subtable.setLanguage(ReadUInt16(&uncompressed_buf, &mut _cnt));



                cmap.setEncodingRecords(encodingRecord);
            }

            // let mut rng = rand::thread_rng();
            // cmp_buf.shuffle(&mut rng);

        }
    }

    // --------------------------------end cmap --------------------------------


    return true;
}
