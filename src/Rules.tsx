import { crate, stateShip } from './art/shapes';
import { ShapeSvg } from './art/ShapeSvg';

/** Goal of the game (first help page). */
export function FundRules() {
  return (
    <ol className="rules">
      <li>
        <ShapeSvg shape={stateShip('arrived')} size={30} />
        <span>
          <strong>Cíl hry:</strong> vydělat co nejvíce převážením zboží. Ne všechny lodě se ale dostanou na konec, proto je lepší se pojistit.
        </span>
      </li>
      <li>
        <ShapeSvg shape={stateShip('lost')} size={30} />
        <span>
          <strong>Nepojištěná ztracená loď je ztracená navždy</strong> a v dalším kole už nemůže převážet zboží.
        </span>
      </li>
      <li>
        <ShapeSvg shape={crate('profit')} size={30} />
        <span>
          Vyhrává nejvyšší výdělek po pěti kolech. Počítá se do něj i hodnota lodí.
        </span>
      </li>
      <li>
        <ShapeSvg shape={crate('fund')} size={30} />
        <span>Během hry můžeš až tříkrát opakovat zahrané kolo. U každého kola se počítá pouze poslední pokus.</span>
      </li>
    </ol>
  );
}
