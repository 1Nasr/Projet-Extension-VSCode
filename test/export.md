---
marp: true
theme: default
paginate: true
math: katex 
---
 

## Diagramme Mermaid

```mermaid
flowchart LR
  A[A] --> B[B]
  B -->|forbid| C[forbidden]
  B --> D(dddddddd)
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