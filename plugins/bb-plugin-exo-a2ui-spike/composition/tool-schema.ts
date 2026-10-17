import {Type} from 'typebox';
// Do not use top-level Any for JSON records: the real model emitted JSON strings.
const id=()=>Type.String({pattern:'^[a-zA-Z][a-zA-Z0-9_-]{0,47}$'}),key={key:id()};
const props:Record<string,any>={
 Column:Type.Object(key),Row:Type.Object(key),
 Text:Type.Object({...key,slot:id(),variant:Type.Union(['h1','h2','h3','body','caption'].map(v=>Type.Literal(v)))}),
 TextField:Type.Object({...key,label:Type.String(),path:Type.String()}),
 Button:Type.Object({...key,label:Type.String(),event:id(),context:Type.Record(Type.String(),Type.Union([Type.String(),Type.Number(),Type.Boolean(),Type.Object({path:Type.String()})]))}),
 Divider:Type.Object(key),
};
export const offerParameters=Type.Object({surfaceId:id(),purpose:Type.String(),candidates:Type.Array(Type.Object({id:id(),description:Type.String(),root:Type.Boolean(),resource:Type.Optional(id()),element:Type.Union(Object.entries(props).map(([type,p])=>Type.Object({type:Type.Literal(type),props:p})))}),{minItems:3,maxItems:16}),slots:Type.Record(Type.String(),Type.Object({brief:Type.String(),fallback:Type.String()})),data:Type.Record(Type.String(),Type.String()),required:Type.Array(id())});
