import './style.css';
import { Instrument } from './instrument';
import { mountInstrument } from './view';

async function main(): Promise<void> {
  const root = document.getElementById('morrigan-root')!;
  try {
    const instrument = new Instrument();
    await instrument.boot();
    (window as unknown as { morrigan: Instrument }).morrigan = instrument;
    mountInstrument(root, instrument);
  } catch (error) {
    root.replaceChildren();
    const title = document.createElement('h1');
    title.textContent = 'MORRIGAN could not start';
    const detail = document.createElement('p');
    detail.textContent = error instanceof Error ? error.message : String(error);
    const retry = document.createElement('button');
    retry.textContent = 'Try again';
    retry.onclick = () => location.reload();
    root.append(title, detail, retry);
    root.setAttribute('role', 'alert');
  }
}
void main();
