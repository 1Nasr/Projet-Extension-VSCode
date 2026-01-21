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
 
```mermaid
classDiagram
    Animal <|-- Duck
    Animal <|-- Fish
    Animal <|-- Zebra
    Animal : +int age
    Animal : +String gender
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
