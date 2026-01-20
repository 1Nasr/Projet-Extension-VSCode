---
marp: true
theme: default
paginate: true
math: katex
---

# Démo complète

Présentation générée avec **Marp**

---
## Diagram

--- 
### Inline

$E = mc^2$  
$E = mc^3$  
$E = mc^4$

---

### Bloc

$$
\int_0^\infty e^{-x^2} \, dx
$$

---

<style> 
  pre.mermaid {
    display: flex; 
    width: 200%;
  }
   
  pre.mermaid svg {
    height: 800px;  
    max-width: 200%;
  }
   
  :root {
    --mermaid-font-family: "Arial";
  }
</style> 
ayuzfgazyufyugyuoaifzjnioazfjnio
<pre class="mermaid" style="font-size: 24px;">
gitGraph:
    commit "Ashish"
    branch newbranch
    checkout newbranch
    commit id:"1111"
    commit tag:"d"
    checkout main
    commit type: HIGHLIGHT
    commit
    merge newbranch
    commit
    branch b2
    commit
</pre> 

<script type="module">
import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
mermaid.initialize({ startOnLoad: true });
</script>
<script> 
  document.addEventListener('DOMContentLoaded', () => {
    console.log("HTML complet de la page :", document.documentElement.outerHTML);
     
    const mermaidBlock = document.querySelector('.mermaid');
    if(mermaidBlock) {
        console.log("Code Mermaid généré :", mermaidBlock.innerHTML);
    }
  });
</script>