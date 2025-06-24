document.addEventListener('DOMContentLoaded', () => {
  const lastCheckedEl = document.getElementById('last-checked');
  const resultsContainerEl = document.getElementById('results-container');
  const globalStatusBannerEl = document.getElementById('global-status-banner');

  function formatDateAsUTC(date) {
    if (!date) return '';
    const options = {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: 'UTC',
      timeZoneName: 'short'
    };
    return new Intl.DateTimeFormat('en-US', options).format(date);
  }

  function cleanExcessiveNewlines(text) {
    if (typeof text !== 'string') return text;
    return text.replace(/\n{3,}/g, '\n\n');
  }

  function formatDataForDisplay(data) {
    if (data && typeof data === 'object' && !Array.isArray(data)) {
        const keys = Object.keys(data);
        if (keys.length === 0) return "{}";

        if (keys.length === 1 && typeof data[keys[0]] === 'string') {
            return cleanExcessiveNewlines(data[keys[0]]);
        }

        if (keys.every(key => typeof data[key] === 'string' || data[key] === null)) {
            let formattedText = '';
            for (const key of keys) {
                formattedText += `--- ${key.toUpperCase()} ---\n`;
                formattedText += (data[key] || '[No content found for this section]') + '\n\n';
            }
            return cleanExcessiveNewlines(formattedText.trim());
        }
    }

    return JSON.stringify(data, null, 2);
  }

  fetch('data.json')
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      lastCheckedEl.textContent = formatDateAsUTC(new Date(data.lastChecked));
      
      const hasAnyUpdates = data.results.some(result => result.success && result.isUpdated);
      let globalStatusHtml = '';

      if (hasAnyUpdates) {
        globalStatusHtml = `
          <div class="alert alert-success d-flex align-items-center" role="alert">
            <i class="bi bi-check-circle-fill me-2"></i>
            <div>
              <strong>New Updates Found!</strong> At least one source has changed in the last 24 hours.
            </div>
          </div>
        `;
      } else {
        globalStatusHtml = `
          <div class="alert alert-warning d-flex align-items-center" role="alert">
            <i class="bi bi-hourglass-split me-2"></i>
            <div>
              <strong>No Recent Changes.</strong> All monitored sources appear stable.
            </div>
          </div>
        `;
      }
      globalStatusBannerEl.innerHTML = globalStatusHtml;

      resultsContainerEl.innerHTML = '';
      data.results.forEach(result => {
        const card = document.createElement('div');
        card.className = 'card mb-3'; 
        
        let cardBodyHtml = '';

        if (!result.success) {
          card.classList.add('border-danger');
          cardBodyHtml = `
            <div class="card-body">
                <div class="d-flex align-items-center mb-2">
                    <span class="status-indicator status-stale"></span>
                    <h5 class="card-title text-danger mb-0">${result.name}</h5>
                </div>
                <h6 class="card-subtitle mb-2 text-body-secondary">Failed to fetch data</h6>
                <pre class="bg-danger-subtle border border-danger rounded p-2">${result.error || 'Unknown error'}</pre>
            </div>
          `;
        } else {
          const statusClass = result.isUpdated ? 'status-ok' : 'status-stale';

          let timestampHtml = `<h6 class="card-subtitle mb-2 text-body-secondary">No changes detected yet.</h6>`;
          if (result.lastChangeTimestamp) {
            const changeDate = new Date(result.lastChangeTimestamp);
            timestampHtml = `<h6 class="card-subtitle mb-2 text-body-secondary">Last change: ${formatDateAsUTC(changeDate)}</h6>`;
          }

          let diffHtml = '';
          if (result.diff && result.diff.length > 1) {
            diffHtml += `
              <div class="diff-container">
                <h4>What Changed:</h4>
                <pre class="diff-view">`;
            
            result.diff.forEach(part => {
              const className = part.added ? 'diff-added' : (part.removed ? 'diff-removed' : 'diff-neutral');
              const span = document.createElement('span');
              span.className = `diff-line ${className}`;
              span.textContent = cleanExcessiveNewlines(part.value);
              diffHtml += span.outerHTML;
            });
            diffHtml += `</pre></div>`;
          }

          cardBodyHtml = `
            <div class="card-body">
              <div class="d-flex align-items-center mb-2">
                <span class="status-indicator ${statusClass}"></span>
                <h5 class="card-title mb-0">${result.name}</h5>
              </div>
              ${timestampHtml}
              ${diffHtml}
              <details>
                  <summary>Show Full Current Data</summary>
                  <pre class="mt-2 p-3 bg-body-tertiary rounded">${formatDataForDisplay(result.data)}</pre>
              </details>
            </div>
          `;
        }
        
        card.innerHTML = cardBodyHtml;
        resultsContainerEl.appendChild(card);
      });
    })
    .catch(error => {
        console.error('Error loading or parsing data.json:', error);
        globalStatusBannerEl.innerHTML = '';
        resultsContainerEl.innerHTML = `
        <div class="alert alert-danger" role="alert">
            <strong>Error:</strong> Could not load data. The checker might be running for the first time or an error occurred.
            Check the console for more details.
        </div>
        `;
    });
});