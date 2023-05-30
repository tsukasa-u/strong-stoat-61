use crate::woff2::Woff2Decompress;

mod woff2_reader;
mod woff2;
mod woff2_def;
mod woff2_cmap;
mod woff2_subtable;
mod woff2_shuffle;

fn main() {
    let mut data:[u8; 1] = Default::default();
    Woff2Decompress(&mut data, 1);
    println!("Hello, world!");
}
