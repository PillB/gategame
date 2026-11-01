# Gateflow — expansión de rondas, mecánicas y experimentos

**Estado (1 nov 2026, UTC):** diseño propuesto + cribado reproducible de 12 comparaciones A/B y 8 interacciones con un modelo simplificado. **R04/R05 tienen ahora un prototipo jugable con llegadas, pronóstico y replay determinista en una rama draft; ninguna ronda nueva está publicada o validada con jugadores.** R06–R39 siguen como propuestas. La Site privada v5 no debe modificarse; este trabajo pertenece al repositorio público de pruebas `PillB/gategame`. La aprobación del dueño y las pruebas de aceptación siguen siendo obligatorias. Ver [contrato de encanto y anécdotas de los 36 episodios](./DELIGHT_LEDGER.md).

## 1. Lo que se conserva de las conversaciones previas

- Identidad: **un rompecabezas operativo de aeropuertos**, no un juego de pulsar botones ni un gestor genérico. Conectar cintas **bloquea** cruces; abrir corredores cambia rutas. Dos procesos: migraciones y seguridad.
- Reglas: A* en celdas cardinales, FIFO por entrada real a fila, búsqueda local de filas (la persona en `4,3,2,5,0` ve `2` pero no el `0` detrás del ascenso a `5`), inercia estocástica y reservas para evitar estampidas, paciencia individual, relevos de trabajadores en cascada, fallas de cintas y supervisor que repara dentro de 90° de visión.
- Realización y economía: 28 personas en la primera versión, 7 puestos por etapa, velocidad simulada determinista, puntuación 0–1000 con desglose, reintentos, abandono y tiempo; desafíos compartidos conservan el mapa inicial y permiten *modificar* cintas para superar la puntuación. No cambiar ni invalidar el formato `G1` sin versionamiento.
- Deudas antes de complejidad: el código `app/page.tsx` todavía concentra el `tick` y tiene parámetros de ronda fijos. **La rama principal más reciente ya incorpora estados `walk1/walk2`, interpolación entre filas y reserva del destino**, con pruebas Node de rondas completas; falta certificar ese movimiento en Chrome/Pages y separar el motor de React. El editor móvil, fuentes en español, mapa/colisión, copia de desafíos, progreso y Pages deben superar gates de navegador por SHA. La documentación histórica no sustituye pruebas sobre el despliegue actual.

## 2. Principio de diseño: dificultad mediante decisiones, no solo castigos

Una complicación entra al juego solo si (a) se comunica antes o durante el evento, (b) ofrece al menos dos intervenciones sensatas dentro del control del jugador, (c) cambia una señal visible y un resultado medible, (d) puede reproducirse con semilla fija, (e) tiene prueba de imposibilidad/bucle y ruta accesible, y (f) no impide completar la ronda por una sorpresa opaca. La audiencia debe poder explicar por qué perdió y qué haría distinto.

Usar **introducción → práctica → giro → combinación → examen → alivio**. Una novedad principal cada 2–3 rondas. Las curvas de reto serán hipótesis de playtest: no existe una ley universal que diga que dificultad creciente siempre divierte. Experimentos de CHI 2017 encontraron que la dificultad moderada resultó más motivante cuando se elegía, que la novedad moderada importaba y que la incertidumbre cercana al resultado ayudaba; otro estudio prerregistrado no encontró un efecto general de balance dificultad-habilidad. Ver referencias al final.

### Mecánicas candidatas (24; agrupar por decisión del jugador)

| ID | Complicación | Decisión realmente nueva | Señal/feedback | Coste | Riesgo a falsar |
| --- | --- | --- | --- | --- | --- |
| M01 | Vuelos por oleadas | Abrir accesos antes de que llegue el banco | Cuenta regresiva + curva de llegadas | Bajo | Turnos vacíos mientras se espera |
| M02 | Dos vuelos simultáneos | Distribuir en paralelo sin embudo | Dos colores/símbolos de vuelo | Medio | Amontonamiento inevitable |
| M03 | Ventanas de conexión | Favorecer pasajeros con tiempo justo | Reloj de conexión y terminal alcanzado | Medio | Penalizar sin control posible |
| M04 | Relevos simultáneos anunciados | Reconfigurar antes del cierre | Aviso previo y cuenta por puesto | Bajo | Cierre total = no decisión |
| M05 | Cierre temporal de puestos | Redirigir flujo al lado abierto | Estatus/duración visible | Medio | Reserva en puesto cerrado |
| M06 | Empleados novatos/rápidos | Balancear longitud vs velocidad | Indicador de velocidad real | Bajo | Etiqueta sugiere rapidez falsa |
| M07 | Reasignar un trabajador | Elegir entre dos puestos, con enfriamiento | Antes/después de capacidad | Alto | Aumento ilimitado de capacidad |
| M08 | Una pausa negociable | Programar descanso sin desatender todos | Cronograma y coste de aplazamiento | Medio | Recompensa por explotación laboral |
| M09 | Inspecciones de cola larga | Mantener rutas alternativas | Incidente + servicio restante estimado | Bajo | Variancia decide sola la victoria |
| M10 | Revisión de equipaje repetida | Reservar espacio de retorno a seguridad | Carril de revisión y contador de vueltas | Alto | Bucle infinito/duplicación |
| M11 | Fila exprés por elegibilidad | Proteger capacidad general y exprés | Símbolo de elegibilidad, nunca color solo | Medio | Discriminación arbitraria/cola vacía |
| M12 | Grupos familiares | Mantener miembros conectados o dividir voluntariamente | Enlace visible entre miembros | Alto | Colisiones y teletransporte |
| M13 | Movilidad accesible | Asegurar un recorrido sin barreras | Ancho de paso y ruta accesible | Alto | Ruta falsamente accesible |
| M14 | Cintas unidireccionales | Dirigir entradas/salidas sin retorno prohibido | Flechas persistentes | Alto | Ciclos o esquinas bloqueadas |
| M15 | Pasillo de emergencia | Dejar ancho de evacuación constante | Franja segura y contador de violaciones | Medio | Premiar barreras inseguras |
| M16 | Cola con señales retrasadas | Distinguir ocupación real de cartel | Frescura del dato en segundos | Medio | Información engañosa sin aviso |
| M17 | Incertidumbre parcial | Elegir una inspección del tablero | Área visible y coste limitado de inspección | Alto | Aleatoriedad opaca/frustrante |
| M18 | Pérdida de cintas durante relevo | Identificar anomalía de topología | Antes/después resaltado y efecto | Existente | Premiar fallas reparadas sin perjuicio |
| M19 | Supervisor ocupado/distinto cono | Escoger cuándo/qué marcar | Vista geométrica, próxima pasada | Medio | Reparación fuera de visión |
| M20 | Presupuesto de cambios | Elegir las dos mejores ediciones | Fichas de reconfiguración | Bajo | Bloqueo irreversible por error táctil |
| M21 | Reglas de ruido de señal | Priorizar fuentes confiables | Indicadores con fecha de actualización | Medio | Se confunde reto con bug de UI |
| M22 | Balance entre etapas | Evitar saturar seguridad al acelerar migraciones | WIP de cada zona + cuello de botella | Medio | Puntos por trasladar congestión |
| M23 | Objetivos múltiples | Escoger rapidez vs abandono vs seguridad | Contrato claro, sin suma opaca | Medio | Una métrica domina a las demás |
| M24 | Reto asimétrico compartido | Un amigo mejora el mapa inicial bajo la misma semilla | Diff de cintas y puntuación comparable | Medio | Versión de reglas distinta vuelve injusto el reto |

Los IDs M10/M12/M13/M14/M17 requieren primero un motor de estados extraído y validación de trayectorias físicas **más allá** de la interpolación actual entre filas. Nunca simularlos solamente cambiando texto o contadores.

## 3. Campaña propuesta: 36 rondas nuevas después de los tres mapas actuales

El contenido es modular; `R04–R39` son identificadores de diseño, **R04 y R05 son candidatos jugables solo en el draft**, y los demás siguen pendientes. Cada ronda tiene un verbo de solución y una idea nueva comprobable. Las rondas de examen combinan mecánicas ya enseñadas; las de alivio dan margen para experimentar y compartir.

| Acto | Rondas (tema y reto específico) | Dominio exigido / cadencia |
| --- | --- | --- |
| I. Llegadas | **R04 Primer aterrizaje**: ventana de vuelo; **R05 Doble desembarque**: dos bancos; **R06 Fila que respira**: pausa entre oleadas; **R07 Conexión ajustada**: urgencia explícita; **R08 La puerta estrecha**: cuello de botella con ráfaga; **R09 Torre de control**: examen M01+M02+M03 | Anticipar vs reaccionar; alivio en R06 |
| II. Trabajadores | **R10 Relevo anunciado**: cierre previsible; **R11 La guardia lenta**: tasa heterogénea; **R12 Ventana de descanso**: escoger pausa; **R13 Dos puestos fuera**: capacidad temporal; **R14 Refuerzo móvil**: reasignar uno; **R15 Cambio de guardia**: examen M04–M08 | Optimización de capacidad; nueva acción en R14 |
| III. Inspecciones | **R16 La maleta difícil**: cola larga; **R17 Una segunda revisión**: retorno a seguridad; **R18 Vía rápida**: elegibilidad visible; **R19 Documentos especiales**: distintos tiempos sin rechazos arbitrarios; **R20 La fila paciente**: recuperación después de una crisis; **R21 Control reforzado**: examen M09–M11 | Variación de servicio y bucles acotados; alivio R20 |
| IV. Geometría humana | **R22 El corredor único**: chokepoint; **R23 Familias juntas**: decisión de grupo; **R24 Ruta accesible**: ancho mínimo; **R25 Tránsito en un sentido**: flechas; **R26 Pasillo de emergencia**: restricción segura; **R27 El laberinto vivo**: examen M12–M15 | A* con restricciones físicas; validación WCAG y no teletransporte |
| V. Información y fallas | **R28 Cartel atrasado**: 5 s de rezago señalado; **R29 Dos fuentes**: lectura de tablero vs suelo; **R30 Cinta desplazada**: marcar anomalía; **R31 Supervisor distraído**: cono y calendario; **R32 Turno claro**: sin sorpresa, ejecutar plan; **R33 La terminal a oscuras**: examen M16–M19+M21 | Observabilidad; R32 como alivio |
| VI. Maestría | **R34 Solo dos cambios**: presupuesto; **R35 Dos cuellos**: balance MIG→SEG; **R36 Prioridades explícitas**: objetivos alternos; **R37 Día de tres vuelos**: pronóstico; **R38 Vuelta al templo**: reinterpretar Serpentina; **R39 Operación total**: final de campaña con reglas conocidas, semilla publicable y desglose causal | Transferencia de aprendizaje; final reinteligible, no caos apilado |

**Variantes opcionales, no más tareas obligatorias:** contratos de maestría (sin abandono / bajo P90 / mínimo número de cintas), desafíos espejo con la misma semilla, y modo libre con mezcla seleccionada por el usuario. No desbloquear mecánicas esenciales mediante rachas o recompensas aleatorias.

## 4. Cribado computacional ejecutado: doce pares A/B de parámetros

Código: `lib/round-experiments.js`; pruebas: `tests/round-experiments.test.mjs`; repetir con `node scripts/compare-rounds.mjs 128` (o 256/512). Cada par usa las mismas 128 semillas en A y B; solo cambia el parámetro declarado, y AB06/AB11 parten de una capacidad restringida idéntica dentro del par. Modelo simplificado de **colas en dos etapas**; utiliza `chooseLocalQueue`, `selectServiceEvent`, paciencia y tiempo de servicio reales, pero no ejecuta geometría, animación, interacción, reparaciones ni la puntuación final. **Escribimos "cribado", no "A/B ganador": no tenemos evidencia de disfrute ni un experimento aleatorizado con personas.**

Resultados al comparar B−A; cifras redondeadas. `P90` corresponde a episodios de fila que llegaron a servicio; si el abandono sube, puede bajar artificialmente (sesgo de supervivencia). Revisar abandono y atendidos conjuntamente.

| ID | Hipótesis de dificultad (B vs A) | Δ atendidos/28 | Δ abandonos | Δ resolución s | Δ espera P90 s | Decisión preliminar |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| AB01 | Oleadas vs flujo uniforme | +0,00 | +0,00 | +7,38 | −2,14 | Prototipar: la espera total incluye huecos entre vuelos |
| AB02 | Dos bancos vs uniforme | −0,04 | +0,04 | +3,17 | +2,33 | Prototipar; acentúa pico sin colapso |
| AB03 | Relevos simultáneos vs cascada | +0,00 | +0,00 | +4,70 | +1,60 | Prioridad alta; requiere aviso anticipado |
| AB04 | Dos averías de módulo vs ninguna | +0,00 | +0,00 | +6,07 | +0,25 | Prototipar con desvío accesible |
| AB05 | 28 % inspecciones largas vs ninguna | −0,08 | +0,08 | +11,30 | +2,42 | Prioridad alta; usar pistas de servicio |
| AB06 | Paciencia ×0,65 vs normal (4 puestos) | −1,82 | +1,98 | −1,88 | −1,38 | **Riesgo alto**: muchos abandonos; optativo/retocar |
| AB07 | Variabilidad de ritmo alta vs normal | +0,00 | +0,00 | +3,27 | +0,25 | Prioridad media; lectura de empleados |
| AB08 | Indicador 5 s atrasado vs actual | +0,00 | +0,00 | +3,07 | +1,19 | Prototipar solo si la antigüedad está señalizada |
| AB09 | 4 puestos vs 7 | −0,63 | +0,78 | +12,46 | +8,97 | Prioridad media; estrés medible, posible frustración |
| AB10 | Trasbordo 0,3 s vs 2 s | +0,00 | +0,00 | −0,36 | +0,05 | Necesita decisión adicional; ahora es casi cosmético |
| AB11 | Carril exprés vs sin él (3 puestos) | +0,00 | +0,00 | +1,66 | −0,04 | **Posponer**: señal de beneficio demasiado débil |
| AB12 | 30 % inspecciones duplicadas vs ninguna | +0,00 | +0,00 | +4,44 | +0,37 | Solo después de implementar vuelta física a cola |

Intervalos de confianza pareados aproximados al 95 % se computan por métrica en `pairedSurrogateScreen`; no equivalen a intervalos sobre la conducta humana. Los resultados dependen de este modelo, sus semilla(s) y las configuraciones registradas. No transferir valores exactos al scoring 0–1000.

### Ocho combinaciones adversarias (interacción de dos factores)

Cuatro brazos por prueba: ninguno, solo A, solo B, ambos. El término de interacción es `efecto(ambos) − efecto(A) − efecto(B)`. Un valor positivo para abandonos significa que apilar mecanismos hizo más daño que sumar sus efectos por separado. Cada casilla usa las mismas 128 semillas. No confundir el término de interacción con una prueba causal en jugadores.

| ID | Par de complicaciones | Cambio total abandonos | Exceso sobre suma individual | Decisión |
| --- | --- | ---: | ---: | --- |
| IX01 | Dos vuelos + relevo conjunto | +0,04 | +0,00 | Admitir con aviso previo |
| IX02 | Dos vuelos + dos averías | +0,02 | −0,02 | Requiere reparación clara |
| IX03 | Cuatro puestos + inspecciones largas | **+2,62** | **+1,76** | **No combinarlas en rondas iniciales** |
| IX04 | Cuatro puestos + baja paciencia | **+2,76** | **+1,98** | **Descartar como combinación por defecto** |
| IX05 | Indicador 5 s atrasado + dos averías | **+1,00** | **+1,00** | Probar primero señales, riesgo de saturación no aditiva |
| IX06 | Trasbordo veloz + revisión | +0,00 | +0,00 | Bajo impacto: falta decisión visible |
| IX07 | Ritmo desigual + relevo conjunto | +0,00 | +0,00 | Buen candidato intermedio |
| IX08 | Dos vuelos + cuatro puestos | +1,00 | +0,18 | Ronda de examen solo tras práctica |

IX03, IX04 e IX05 son la razón para **no mezclar todas las complicaciones** en una supuesta ronda final. Deben repetirse tras extracción del motor real y con intervenciones humanas posibles, antes de decidir umbrales definitivos.

### Selección tras dos iteraciones de cribado

1. **Prototipo vertical A:** R04/R05, llegada por bancos. Un reloj visible debe transformar una oleada en una decisión preventiva. Comparar *aviso 8 segundos antes* vs *aviso al aparecer*, sin cambiar el tráfico real: medir decisiones útiles y comprensión.
2. **Prototipo vertical B:** R10/R11, relevo programado y ritmo desigual. Comparar *cronograma anticipado* vs *solo estado actual*, conservando cierres y seed: medir abandonos, pausas y percepción de control.
3. **Prototipo vertical C:** R16, inspección larga con alternativa de desvío. Comparar *ETA del puesto* vs *solo cola visible*, mismas duraciones: medir cambios de layout y errores.
4. **No priorizar todavía:** castigar paciencia (AB06), carril exprés (AB11), niebla de información (M17), familias (M12) o accesibilidad restringida (M13) antes de tener motor físico, caminos sin saltos y pruebas humanas. Accesibilidad de la interfaz **sí** sigue siendo requisito, no variante opcional.

## 5. Contrato técnico de un motor de rondas

La rama de prueba ya pasa `roundId` a `tick`, con un catálogo validado de horarios para R04/R05, pero **no** dispone aún de un motor extraído, validador general de reglas ni acciones/eventos arbitrarios. Primero extraer `step(state, action, config)` de React, conservar compatibilidad v5 y crear `RoundDefinition` completo. Configuración propuesta (esquema conceptual):

```ts
type RoundDefinition = {
  id: string; rulesVersion: string; seed: number;
  passengerSchedule: { at: number; count: number; groupId?: string }[];
  serviceStages: { id: "immigration" | "security"; desks: number; paceCurve: number[] }[];
  timeline: { at: number; kind: "announce" | "close" | "open" | "shift" | "beltFault"; target: string; duration?: number }[];
  specialRules: string[]; interventionBudget?: number;
  objective: { completedMin: number; maxAbandoned: number; deadline?: number };
  teaching: { teaser: string; decision: string; debriefQuestion: string };
};
```

**Reglas de implementación:**

- `rulesVersion + seed + roundId + startingLayout` determina eventos y resultados; el reloj de simulación es el único reloj de efectos. Versionar enlaces `challenge` y no comparar marcas de reglas diferentes.
- Catálogo de eventos determinista, con `precondition → apply → invariant → log`. Ningún evento duplica o desaparece pasajeros, cierra *todos* los destinos por accidente o cambia el servicio en curso retroactivamente sin anunciarlo.
- Mover una persona de fila ya usa `choice → walk1/walk2 → queued`, reservando el destino, con secuencia FIFO asignada al llegar; los tests de rondas completas de `main` cubren esta transición. Hay que preservar ese contrato al extraer el motor, y probar en navegador la interpolación/hit-testing y cualquier obstáculo nuevo; el servicio nunca debe comenzar mientras camina.
- Al cargar, un validador comprueba alcanzabilidad, conexiones seguras, carril accesible, capacidad mínima, objetivos físicamente posibles, ausencia de fuentes ocultas de puntos infinitos y longitud máxima. Ante mapa irresoluble, explica el conflicto y ofrece una edición deshacer.
- Score de campaña debe ser comparativo por *ronda* o normalizado en condiciones equivalentes; la fórmula v5 con denominador 28 no se reutiliza sin ajuste cuando hay 42 pasajeros o ventanas de conexión. Guardar ledger por evento para resultados atribuibles.
- Un paquete de ronda debe incluir escena/sprite y señales accesibles, copia es-PE, texto de tutorial, una configuración "fácil" elegida voluntariamente, archivos de QA y fixtures de replay.

## 6. Programa de A/B real y criterios falsables

**Antes de cualquier experimento con humanos:** completar P0 de conservación/replay, app móvil, UI legible, navegación por teclado, publicación SHA verificable y consentimiento informado para recopilar métricas. El cribado de 128 semillas solo sirve para priorizar qué construir.

| Ola | Comparación aleatorizada, una variable por par | Métrica primaria pre-registrada | Guardrails |
| --- | --- | --- | --- |
| Pilotaje de 5–8 personas | Pensar en voz alta, sin A/B inferencial | Entiende la regla y termina una ronda sin ayuda | No confundir cinta con camino; no bloqueo ni bug |
| A/B-PLAYER-1 | Aviso de próxima oleada 8 s antes vs 0 s | % que hace una edición útil **antes** de la llegada | Terminar turno, abandono, frustración, foco/lectura móvil |
| A/B-PLAYER-2 | Cronograma completo de cierres vs estado actual | % que anticipa el primer relevo correctamente | Tiempo de inspección, abandono, accesibilidad |
| A/B-PLAYER-3 | ETA visible por módulo vs solo longitud de fila | % que reduce espera total en el reintento con igual semilla | Caídas, colisiones, abandono, comprensión de ETA |
| A/B-PLAYER-4 (posterior) | Explicación de causalidad en debrief vs solo total | % que mejora en segundo intento | Tiempo de lectura, esfuerzo percibido, datos personales |

Asignar variante por participante, no por click/turno; mantener asignación constante en reintentos. Estratificar por experiencia previa y dispositivo, congelar versión/semilla dentro del par. Un solo objetivo principal por prueba, N planificado y ventana de cierre predefinida, intención de analizar a todos los asignados, verificar razón 50/50 y pérdidas de medición. Si se hacen muchos tests, ajustar comparaciones (p. ej. Holm) o tratarlos como exploratorios, no declarar todas las señales "ganadoras".

**Escala realista:** para distinguir aproximadamente 60 % frente a 75 % de finalización, alfa bilateral 0,05 y potencia 80 %, la fórmula normal aproximada exige **~152 participantes por variante**. Cinco usuarios son una prueba de usabilidad, no poder estadístico para esa diferencia. Si no hay tráfico, usar entrevistas con diseño cruzado y reporte descriptivo, sin valor p.

**Definición propuesta de "mejor diversión":** mejoría de la métrica principal y de comprensión sin caída relevante de finalización, accesibilidad ni percepción de justicia; entrevista abierta "¿Qué harías distinto?" con respuesta causal; un segundo intento **voluntario**. Una mejora de tiempo de juego a costa de frustración no cuenta como victoria.

## 7. QA y seguridad de cada ronda nueva

| Gate | Prueba negativa / oráculo falsable |
| --- | --- |
| INVARIANT | Cada tick: `spawned = active + cleared + turnedAway + abandoned + failed`, un solo estado por ID, sin reserva doble |
| ROUTING | Cerrando un cruce cuando el sprite está próximo: nunca atraviesa una cinta; recalcula, espera o explica imposibilidad |
| LOCAL | `[4,3,2,5,0]` elige como máximo `2`; 50 decisiones simultáneas usan reservas; no oscilación/teletransporte |
| SHIFTS | Corte/reapertura en límites exactos, pausa, ½×/1×/2×, fin; sin servicio en cerrado; no cambio retroactivo |
| EVENTS | Revisión repetida tiene contador/techo; nunca crea clones; probabilidad y semillas reproducibles |
| FAIRNESS | Seeds 1–1000 sobre mapas generados: ningún nivel exige acciones imposibles, todos tienen estrategia factible documentada |
| INTERFACE | 390×844, 1440×900, 200 % zoom, reducción de movimiento; textos largos es-PE, indicadores no basados solo en color |
| REWARD | El ledger es idempotente; no se premia cambiar de fila ida y vuelta ni marcar infinitas fallas |
| COMPAT | Tres mapas v5 conservan salidas, score y desafío bajo `rulesVersion=v5` antes y después del motor nuevo |
| LIVE | QA de controles y captura en GitHub Pages contra **SHA del artifact**; CI solo no significa aprobado en producción |

## 8. Backlog, riesgos y definición de terminado

| Prioridad | Ticket | Estado actual | Condición de cierre |
| --- | --- | --- | --- |
| P0 | RND-00 Versión v5 congelada y comparación determinista | **No iniciado** | Tres mapas/semillas y ledger de score idénticos |
| P0 | RND-01 Extraer `step()` puro conservando cola caminante y reservas existentes | **Parcial**: `walk1/walk2` y fixtures de ronda completa ya están en `main`; extracción pendiente | Tests por tick del motor extraído + sprites sin salto en navegador + 1×/2× iguales |
| P0 | RND-02 Esquema `RoundDefinition`/validador | **Parcial**: catálogo `lib/rounds.js`, `waves-1`, 28 horarios, rechazo de links malversionados; motor general pendiente | Cargas válidas + rechazos seguros + reglas versionadas |
| P1 | RND-03 R04/R05 oleadas, tutorial y predicción | **Candidato en draft**: UI con selector, pronóstico, landing feed, fixtures y desafíos versionados | Chrome/Pages screenshots + balance real + UAT |
| P1 | RND-04 R10/R11 relevos y ritmo desigual | **Pendiente** | Aviso anticipado y fallbacks, solo una variable A/B |
| P1 | RND-05 R16 inspecciones largas y ETA | **Pendiente** | Decisión observable; cero estado imposible |
| P1 | RND-06 A/B de jugadores con consentimiento | **No iniciado** | Asignación, captura, preregistro y análisis válido |
| P2 | RND-07 Campaña R06–R39 escalonada | **Propuesta** | Solo tras prototipos, balance y accesibilidad |
| P0 de lanzamiento | QA de Pages, navegador, dueño | **Pendiente de revalidar** | Página exacta + todas las fases + aprobación expresa |

`ROUND_AB_PAIRS`, `ROUND_INTERACTIONS`, `pairedSurrogateScreen` e `interactionSurrogateScreen` pasan pruebas de conservación y repetibilidad del **modelo**; eso no cierra ninguno de los tickets de producción.

## Fuentes de investigación (principales)

- Lomas et al., *Is Difficulty Overrated?*, CHI 2017, tres experimentos con más de 20.000 sesiones: https://doi.org/10.1145/3025453.3025638
- Isaksen y Nealen, *Comparing Player Skill, Game Variants, and Learning Rates Using Survival Analysis*, AIIDE 2015: https://doi.org/10.1609/aiide.v11i5.12846
- Li, Ryan y Sheng, *Optimal Sequencing in Single-Player Games*, Management Science 2023: https://doi.org/10.1287/MNSC.2022.4665
- Jennings-Teats, Smith y Wardrip-Fruin, *Polymorph: A Model for Dynamic Level Generation*, AIIDE 2010: https://doi.org/10.1609/aiide.v6i1.12417
- *Difficulty-skill balance does not affect engagement and enjoyment: a pre-registered study*, 2023: https://pmc.ncbi.nlm.nih.gov/articles/PMC9890114/
- Gateflow repo: [`docs/GAME_SPEC.md`](./GAME_SPEC.md), [`docs/GROWTH_AND_PLAYTEST.md`](./GROWTH_AND_PLAYTEST.md), [`docs/QA_LEDGER.md`](./QA_LEDGER.md); estado revisado contra `d6c8509`, sin afirmar deploy.
