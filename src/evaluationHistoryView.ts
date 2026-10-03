import { comparisonKey, historyChart, historyColors, historyMetrics, historyValue } from './shared/evaluationHistory';
import type { EvaluationHistory, HistoryMetric } from './shared/evaluationHistory';

export class EvaluationHistoryView {
    private history: EvaluationHistory = { runs: [], skipped: 0 };
    private metric = document.getElementById('history-metric') as HTMLSelectElement;
    private snake = document.getElementById('history-snake') as HTMLSelectElement;
    private compatible = document.getElementById('history-compatible') as HTMLInputElement;
    constructor() {
        for (const [value, label] of Object.entries(historyMetrics)) this.metric.add(new Option(label, value));
        this.metric.onchange = this.snake.onchange = this.compatible.onchange = () => this.render();
    }
    async refresh(): Promise<void> {
        const message = document.getElementById('history-message');
        try {
            const response = await fetch('/api/evaluation/history');
            if (!response.ok) throw new Error('Could not load evaluation history.');
            this.history = await response.json();
            const previous = this.snake.value;
            this.snake.replaceChildren(new Option('All snakes', ''));
            const names = [...new Set(this.history.runs.flatMap(run => run.options.snakes))].sort();
            for (const name of names) this.snake.add(new Option(name, name));
            this.snake.value = names.includes(previous) ? previous : '';
            this.render();
        } catch (error) { message.textContent = error.message; }
    }
    private render() {
        const latest = this.history.runs.at(-1);
        const runs = this.history.runs.filter(run => !this.compatible.checked || comparisonKey(run) === comparisonKey(latest));
        const names = this.snake.value ? [this.snake.value] : [...new Set(runs.flatMap(run => run.options.snakes))].sort();
        const metric = this.metric.value as HistoryMetric;
        const groups = new Set(runs.map(comparisonKey)).size;
        document.getElementById('history-message').textContent = !latest ? 'No completed evaluations yet. Run npm run evaluate to start a history.' :
            `${runs.length} of ${this.history.runs.length} saved completed runs shown. ${runs.length < 2 ? 'Run another evaluation with the same settings to see a trend. ' : ''}${groups > 1 ? 'Mixed settings: opponent pools, seeds, engine or budgets differ; results are not directly comparable. ' : ''}${this.history.skipped ? `${this.history.skipped} unreadable report(s) skipped.` : ''}`;
        const chart = document.getElementById('history-chart'); chart.innerHTML = historyChart(runs, names, metric);
        const legend = document.getElementById('history-legend'); legend.replaceChildren();
        names.forEach((name, index) => {
            const item = document.createElement('span');
            const dot = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); dot.setAttribute('width', '12'); dot.setAttribute('height', '12');
            const circle = document.createElementNS(dot.namespaceURI, 'circle'); circle.setAttribute('cx', '6'); circle.setAttribute('cy', '6'); circle.setAttribute('r', '4'); circle.setAttribute('fill', historyColors[index % historyColors.length]); dot.append(circle);
            item.append(dot, document.createTextNode(name)); legend.append(item);
        });
        const detail = document.getElementById('history-detail'); detail.textContent = 'Hover, focus or select a point for its date, revision and sample size.';
        for (const point of chart.querySelectorAll<SVGElement>('[data-detail]')) {
            const show = () => { detail.textContent = point.dataset.detail; };
            point.onfocus = point.onmouseenter = point.onclick = show;
            point.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); show(); } };
        }
        const table = document.getElementById('history-runs'); table.replaceChildren();
        for (const [index, run] of runs.entries()) {
            const tr = document.createElement('tr'), o = run.options;
            const values = [`#${index + 1} · ${new Date(run.finished).toLocaleString()}`, run.revision, `${run.rated}/${run.scheduled}`,
                `${o.width}×${o.height} · seed ${o.seed} · ${o.rounds} rounds · ${o.timeout} ms/move · ${o.maxSeconds} s/game · concurrency ${o.concurrency}\n${o.snakes.join(', ')}`,
                names.map(name => { const row = run.rankings.find(row => row.name === name); const value = row ? historyValue(row, metric) : null; return `${name}: ${value === null ? '—' : value.toFixed(1)}`; }).join('\n')];
            for (const value of values) { const td = document.createElement('td'); td.textContent = value; tr.append(td); }
            table.append(tr);
        }
        document.getElementById('history-value-heading').textContent = historyMetrics[metric];
    }
}
