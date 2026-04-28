import{r as u,j as m,a as t}from"./index.a7c9b99b.js";const f=u.exports.forwardRef(({value:s,onChange:a,onKeyDown:o,placeholder:n,size:l="md",fullWidth:r=!1,icon:e,autoFocus:p,className:c="",type:d="text"},i)=>m("div",{className:`relative ${r?"w-full":""}`,children:[e&&t("div",{className:"absolute left-2 top-1/2 -translate-y-1/2 text-secondary pointer-events-none",children:e}),t("input",{ref:i,type:d,value:s,onChange:a,onKeyDown:o,placeholder:n,autoFocus:p,className:`
          ${l==="md"?"py-2 text-sm":"py-1 text-sm"} ${e?"pl-8":"pl-2"} pr-2 rounded bg-surface-2 border border-primary
          text-primary placeholder:text-secondary
          focus:outline-none focus:ring-2 focus:ring-accent/60
          hover:bg-surface-3 transition-colors
          ${r?"w-full":""}
          ${c}
        `})]}));f.displayName="Input";export{f as I};
