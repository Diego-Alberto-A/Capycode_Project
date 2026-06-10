CapyCode - Carpeta de audio ambiental
=====================================

Coloca aquí los archivos de música/ambiente. Formatos soportados (en orden de
preferencia): .opus, .ogg, .mp3, .wav, .m4a, .aac

Nombres esperados (el juego buscará automáticamente cualquiera de las extensiones):

  main      -> Mapa principal (hub)
  audio1    -> Escenario 3D 1  (tema 1 / scene1)
  audio2    -> Escenario 3D 2  (tema 2 / scene2)
  audio3    -> Escenario 3D 3  (tema 3 / scene3)
  audio4    -> Escenario 3D 4  (tema 4 / scene4)
  audio5    -> Escenario 3D 5  (tema 5 / scene5)
  audio6    -> Escenario 3D 6  (tema 6 / scene6)
  audio7    -> Escenario 3D 7  (tema 7 / scene7)
  audio8    -> Escenario 3D 8  (tema 8 / scene8)

Escenario 9 (scene9): aún no tiene audio asignado. El juego mostrará el aviso
"Sera anadido pronto" hasta que agregues 'audio9' aquí.

Ejemplo:
  public/audio/main.ogg
  public/audio/audio1.mp3
  public/audio/audio2.opus
  ...

El audio se reproduce automáticamente al entrar a cada escena y hace loop.
