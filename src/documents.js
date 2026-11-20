// Same signature checks and limits as E1, extracted for reuse by deadline attachments.
export async function documentFromFile(file,now=new Date().toISOString()){
 if(!file||file.size<1||file.size>1048576)throw Error('Choisissez un fichier de 1 octet à 1 Mio.');
 const bytes=new Uint8Array(await file.arrayBuffer());let mime='';
 if(bytes[0]===37&&bytes[1]===80&&bytes[2]===68&&bytes[3]===70&&bytes[4]===45)mime='application/pdf';
 else if([137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))mime='image/png';
 else if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)mime='image/jpeg';
 else if(/\.txt$/i.test(file.name)){try{new TextDecoder('utf-8',{fatal:true}).decode(bytes);if(bytes.includes(0))throw Error();mime='text/plain';}catch{throw Error('Texte UTF-8 invalide.');}}
 if(!mime)throw Error('Type non autorisé ou signature de fichier invalide.');
 const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');let binary='';for(const b of bytes)binary+=String.fromCharCode(b);
 return {id:crypto.randomUUID(),title:file.name,category:'Autre',name:file.name,mime,size:file.size,sha256,base64:btoa(binary),addedAt:now,documentDate:''};
}
