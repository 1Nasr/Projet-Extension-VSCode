# Démo complète

## Maths
Inline : $E = mc^2$\
$E = mc^3$
$E = mc^4$

Bloc :
$$
\int_0^\infty e^{-x^2} dx
$$

## Diagramme Mermaid
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
