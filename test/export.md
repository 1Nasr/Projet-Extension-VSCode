---
marp: true
theme: default
paginate: true
math: katex
config:
  layout: dagre
  look: classic
  theme: dark
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
```mermaid
flowchart TD
    A[Christmas] -->|Get money| B(Go shopping)
    B --> C{Let me think}
    C -->|One| D[Laptop]
    C -->|Two| E[iPhone]
    C -->|Three| F[fa:fa-car Car]
```
---

### Bloc

$$
\int_0^\infty e^{-x^2} \, dx
$$

---

<style> 
  pre.mermaid {
    display: flex; 
    width: 100%;
  }
   
  pre.mermaid svg {
    height: 800px;  
    max-width: 100%;
  }
   
  :root {
    --mermaid-font-family: "Arial";
  }
</style> 
ayuzfgazyufyugyuoaifzjnioazfjnio
<pre class="mermaid" style="font-size: 24px;">
mindmap
  root((mindmap))
    Origins
      Long history
      ::icon(fa fa-book)
      Popularisation
        British popular psychology author Tony Buzan
    Research
      On effectiveness<br/>and features
      On Automatic creation
        Uses
            Creative techniques
            Strategic planning
            Argument mapping
    Tools
      Pen and paper
      Mermaid
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