import { serve } from "https://deno.land/std@0.177.0/http/server.ts";



fetch("https://cdn.jsdelivr.net/gh/tsukasa-u/D3NS@main/font/D3DN.woff")
  .then(response => response.blob())
  .then(blob =>  {
    // serve((req: Request) => blob);
    console.log(blob);
    var reader = new FileReader();
    reader.onload = function() {
        var result = new Uint8Array(reader.result);
    };
    reader.readAsArrayBuffer(blob);
})
serve((req: Request) => {
    return new Response("Hello World");
});



