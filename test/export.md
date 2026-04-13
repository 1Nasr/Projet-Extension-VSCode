---
marp: true
theme: default
paginate: true
math: katex 
---
 

## Diagramme Mermaid

```mermaid
gantt
    title Example Gantt
    dateFormat  YYYY-MM-DD
    section Planning
    Task A :a1, 2024-01-01, 7d
    Task B :after a1, 5d
 ```
 
```mermaid
gitGraph
    commit
    branch develop
    checkout develop
    commit
    commit
    checkout main
    merge develop
    commit
    branch feature
    checkout feature
    commit
    commit
    checkout main
    merge feature
 ```
 ---
 ::: bonjour 


```mermaid
classDiagram
    Animal <|-- Duck
    Animal <|-- Fish
    Animal <|-- Zebra
    Animal : +int age
    Ani100mal : +String gender
    Animal: +isMammal()
    Animal: +mate()
    class Duck{
      +String beakColor
      +swim()
      +quack()
    }
    class Fish{
      -int sizeInFeet
      -canEat()
    }
    class Zebra{
      +bool is_wild
      +run()
    }
 ```

 :::

---
```mermaid
graph TD;
    A-->B;
    A-->C;
    B-->D;
    C-->D;
  ```
--- 
```mermaid
sequenceDiagram
    participant Alice
    participant Bob
    Alice->>John: Hello John, how are you?
    loop HealthCheck
        John->>John: Fight against hypochondria
    end
    Note right of John: Rational thoughts <br/>prevail!
    John-->>Alice: Great!
    John->>Bob: How about you?
    Bob-->>John: Jolly good!
   ```

  ---
  ::: parent
contenu du parent
::: enfant
contenu de l'enfant
:::
encore du parent
:::


---
::: info Informations utiles
Contenu du bloc info
:::

::: warning Attention
Contenu du bloc warning
:::

---
::: tip Astuce
Contenu du bloc tip
:::

::: exercise Exercice 1
Résous ce problème
:::

::: solution Correction
Voici la solution
:::

---


:::COL {c2, l2, r2} 
:::ITEM Centre 
A
:::


:::ITEM Gauche
B
:::

:::ITEM Droite
C
:::
:::

---

:::COL {l2, r1}
:::ITEM Theorie
Un peu de texte.

:::tip Astuce
Pense a verifier les ratios.
:::
:::

:::ITEM Pratique
:::solution Correction
La solution s'affiche ici.
:::
:::
:::

---
:::#3CF527 Attention rouge
:::rgb(3, 213, 241) Alerte orange vif
Contenu avec couleur rgb personnalisée
:::
Contenu avec couleur hex personnalisée
:::

:::rgb(234, 12, 223) Alerte orange vif
Contenu avec couleur rgb personnalisée
:::

:::rgb(232, 241, 99) Bloc générique indigo
Sans keyword prédéfini, juste une couleur
:::

---
::: rgb(41, 182, 247) Info verte
La couleur écrase celle du type prédéfini
:::
