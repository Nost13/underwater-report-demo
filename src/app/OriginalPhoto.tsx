import {useEffect,useRef,useState} from 'react';

export function OriginalPhoto({file}:{file:File}) {
 const imageRef=useRef<HTMLImageElement>(null);
 const [failed,setFailed]=useState(false);
 useEffect(()=>{
  const source=URL.createObjectURL(file);
  const image=imageRef.current;
  if(image)image.src=source;
  return ()=>{image?.removeAttribute('src');URL.revokeObjectURL(source);};
 },[file]);
 if(failed)return <p role="alert">원본 사진을 표시할 수 없습니다.</p>;
 // Local original-file URLs must not pass through a remote image optimizer.
 // eslint-disable-next-line @next/next/no-img-element
 return <img ref={imageRef} alt={file.name} onError={()=>setFailed(true)}/>;
}
