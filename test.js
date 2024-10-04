let D=new Date();
let p=1;
let s=Buffer.alloc(4,0);
s.writeInt8(0,1);

for(let i=0;i<100000000;i++){
if(s.readInt8(1)){
    p=!p;
}
}
console.log("Buffer:"+(new Date()-D))