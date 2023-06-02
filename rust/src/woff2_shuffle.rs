#![allow(unused_variables, non_snake_case, dead_code, non_camel_case_types)]

use crate::{woff2_cmap::Woff2EncodingRecord, woff2_subtable::{Woff2CampSubTableTrait, Woff2CampSubTable4}};


pub fn shuffle(encodingRecord: &mut Woff2EncodingRecord/*, data: &mut [u8]*/) -> bool {

    match encodingRecord.getFormatType() {
        Some(0u16) => 0,
        Some(2u16) => 2,
        Some(4u16) => 4,
        Some(6u16) => 6,
        Some(8u16) => 8,
        Some(10u16) => 10,
        Some(12u16) => 12,
        Some(13u16) => 13,
        Some(14u16) => 14,
        _ => return false,
    };
    // let tmp: Woff2CampSubTable4 = encodingRecord.subtable.as_ref().unwrap().as_ref().into();
    return true;
}

fn shuffleSubTable4() {

}