(function () {
  'use strict';

  var MODAL_ID = 'quick-view-modal';
  var modal, state;

  function init() {
    document.addEventListener('click', function (e) {
      var trigger = e.target.closest('.product_quickview');
      if (trigger) {
        e.preventDefault();
        var handle = trigger.dataset.productHandle;
        if (handle) openQuickView(handle);
      }
    });
  }

  function ensureModal() {
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.className = 'qv-overlay';
    modal.innerHTML =
      '<div class="qv-modal" role="dialog" aria-modal="true">' +
        '<button type="button" class="qv-close" aria-label="Close"></button>' +
        '<div class="qv-body"><div class="qv-loading">Loading…</div></div>' +
      '</div>';
    document.body.appendChild(modal);

    modal.addEventListener('click', function (e) {
      if (e.target === modal) closeQuickView();
    });
    modal.querySelector('.qv-close').addEventListener('click', closeQuickView);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.classList.contains('is-open')) closeQuickView();
    });
    return modal;
  }

  function openQuickView(handle) {
    ensureModal();
    modal.classList.add('is-open');
    document.body.classList.add('qv-lock-scroll');
    var body = modal.querySelector('.qv-body');
    body.innerHTML = '<div class="qv-loading">Loading…</div>';

    fetch('/products/' + handle + '.js')
      .then(function (r) {
        if (!r.ok) throw new Error('Product fetch failed');
        return r.json();
      })
      .then(function (product) {
        state = buildState(product);
        renderModal();
      })
      .catch(function () {
        body.innerHTML = '<p class="qv-error">Sorry, this product could not be loaded.</p>';
      });
  }

  function closeQuickView() {
    if (!modal) return;
    modal.classList.remove('is-open');
    document.body.classList.remove('qv-lock-scroll');
  }

  function buildState(product) {
    var optionsWithValues = buildOptionsWithValues(product);
    var colorOption = findOption(optionsWithValues, ['color', 'colour']);
    var sizeOption = findOption(optionsWithValues, ['size']);
    return {
      product: product,
      colorOption: colorOption,
      sizeOption: sizeOption,
      selectedColor: null,
      selectedSize: null
    };
  }

  function buildOptionsWithValues(product) {
    return product.options.map(function (opt, idx) {
      var key = 'option' + (idx + 1);
      var values = [];
      product.variants.forEach(function (v) {
        var val = v[key];
        if (val !== undefined && val !== null && values.indexOf(val) === -1) values.push(val);
      });
      return { index: idx, name: opt.name, values: values };
    });
  }

  function findOption(optionsWithValues, names) {
    var idx = optionsWithValues.findIndex(function (o) {
      return names.indexOf(o.name.toLowerCase()) !== -1;
    });
    return idx === -1 ? null : optionsWithValues[idx];
  }

  function currentVariant() {
    var p = state.product;
    return p.variants.find(function (v) {
      var opts = [v.option1, v.option2, v.option3];
      if (state.colorOption && opts[state.colorOption.index] !== state.selectedColor) return false;
      if (state.sizeOption && opts[state.sizeOption.index] !== state.selectedSize) return false;
      return true;
    });
  }

  function variantAvailableFor(colorVal, sizeVal) {
    var p = state.product;
    return p.variants.some(function (v) {
      var opts = [v.option1, v.option2, v.option3];
      if (colorVal !== undefined && state.colorOption && opts[state.colorOption.index] !== colorVal) return false;
      if (sizeVal !== undefined && state.sizeOption && opts[state.sizeOption.index] !== sizeVal) return false;
      return v.available;
    });
  }

  function renderModal() {
    var p = state.product;
    if (state.colorOption && !state.selectedColor) state.selectedColor = state.colorOption.values[0];

    var image = (currentVariant() && currentVariant().featured_image && currentVariant().featured_image.src) ||
      (p.featured_image) || (p.images[0] || '');
    var priceHtml = renderPrice();
    var descHtml = stripAndTruncate(p.description, 160);

    var body = modal.querySelector('.qv-body');
    body.innerHTML =
      '<div class="qv-media"><img src="' + escapeAttr(image) + '" alt="' + escapeAttr(p.title) + '"></div>' +
      '<div class="qv-info">' +
        '<h3 class="qv-title">' + escapeHtml(p.title) + '</h3>' +
        '<div class="qv-price">' + priceHtml + '</div>' +
        (descHtml ? '<p class="qv-desc">' + escapeHtml(descHtml) + '</p>' : '') +
      '</div>' +
      '<div class="qv-btm-info">' +
        (state.colorOption ? renderColorBlock() : '') +
        (state.sizeOption ? renderSizeBlock() : '') +
        '<button type="button" class="qv-atc" type="button"></button>' +
      '</div>';

    if (state.colorOption) bindColorSwatches();
    if (state.sizeOption) bindSizeSelect();
    bindAddToCart();
    updateAvailabilityUI();
  }

  function renderPrice() {
    var v = currentVariant();
    var price = v ? v.price : state.product.price;
    var compareAt = v ? v.compare_at_price : state.product.compare_at_price;
    var html = '<span class="qv-price-now">' + formatMoney(price) + '</span>';
    if (compareAt && compareAt > price) {
      html += ' <span class="qv-price-compare">' + formatMoney(compareAt) + '</span>';
    }
    return html;
  }

  function renderColorBlock() {
    var html = '<div class="qv-field"><label>' + escapeHtml(state.colorOption.name) + '</label><div class="qv-swatches">';
    state.colorOption.values.forEach(function (val) {
      var active = val === state.selectedColor ? ' is-active' : '';
      html += '<button type="button" class="qv-swatch' + active + '" data-value="' + escapeAttr(val) + '">' + escapeHtml(val) + '</button>';
    });
    html += '</div></div>';
    return html;
  }

  function renderSizeBlock() {
    var html = '<div class="qv-field"><label>' + escapeHtml(state.sizeOption.name) + '</label>' +
      '<div class="qv-select-wrap"><select class="qv-size-select">' +
      '<option value="" disabled' + (state.selectedSize ? '' : ' selected') + '>Choose your size</option>';
    state.sizeOption.values.forEach(function (val) {
      var available = variantAvailableFor(state.selectedColor, val);
      var selected = val === state.selectedSize ? ' selected' : '';
      var disabled = available ? '' : ' disabled';
      html += '<option value="' + escapeAttr(val) + '"' + selected + disabled + '>' + escapeHtml(val) + (available ? '' : ' - Sold out') + '</option>';
    });
    html += '</select><span class="qv-select-chevron">&#9662;</span></div></div>';
    return html;
  }

  function bindColorSwatches() {
    modal.querySelectorAll('.qv-swatch').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.selectedColor = btn.dataset.value;
        if (state.selectedSize && !variantAvailableFor(state.selectedColor, state.selectedSize)) {
          state.selectedSize = null;
        }
        renderModal();
      });
    });
  }

  function bindSizeSelect() {
    var select = modal.querySelector('.qv-size-select');
    select.addEventListener('change', function () {
      state.selectedSize = select.value || null;
      updateAvailabilityUI();
    });
  }

  function updateAvailabilityUI() {
    var priceEl = modal.querySelector('.qv-price');
    if (priceEl) priceEl.innerHTML = renderPrice();
    var img = modal.querySelector('.qv-media img');
    var v = currentVariant();
    if (img && v && v.featured_image) img.src = v.featured_image.src;

    var atc = modal.querySelector('.qv-atc');
    if (!atc) return;
    atc.disabled = false;
    atc.classList.remove('is-disabled');

    if (state.sizeOption && !state.selectedSize) {
      atc.innerHTML = 'Choose your size';
      atc.disabled = true;
      atc.classList.add('is-disabled');
      return;
    }
    if (!v || !v.available) {
      atc.innerHTML = 'Sold out';
      atc.disabled = true;
      atc.classList.add('is-disabled');
      return;
    }
    atc.innerHTML = 'Add to cart <span class="qv-atc-arrow">&#8594;</span>';
  }

  function bindAddToCart() {
    var atc = modal.querySelector('.qv-atc');
    atc.addEventListener('click', function () {
      var v = currentVariant();
      if (!v || !v.available || atc.disabled) return;
      atc.disabled = true;
      var originalHtml = atc.innerHTML;
      atc.innerHTML = 'Adding…';

      fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ id: v.id, quantity: 1 })
      })
        .then(function (r) {
          if (!r.ok) throw new Error('Add to cart failed');
          return r.json();
        })
        .then(function () {
          atc.innerHTML = 'Added &#10003;';
          refreshCartUI();
          setTimeout(function () {
            closeQuickView();
          }, 700);
        })
        .catch(function () {
          atc.innerHTML = originalHtml;
          atc.disabled = false;
        });
    });
  }

  function refreshCartUI() {
    var drawer = document.querySelector('cart-drawer');
    var notification = document.querySelector('cart-notification');
    if (drawer && typeof drawer.renderContents === 'function') {
      fetch('/cart.js')
        .then(function (r) { return r.json(); })
        .then(function (cart) { drawer.renderContents(cart); });
    } else if (notification && typeof notification.renderContents === 'function') {
      fetch('/cart.js')
        .then(function (r) { return r.json(); })
        .then(function (cart) { notification.renderContents(cart); });
    }
    document.dispatchEvent(new CustomEvent('cart:refresh'));
    window.location.href= '/cart';
  }

  function formatMoney(cents) {
    if (window.Shopify && typeof Shopify.formatMoney === 'function' && window.theme && theme.moneyFormat) {
      return Shopify.formatMoney(cents, theme.moneyFormat);
    }
    var currency = (window.Shopify && Shopify.currency && Shopify.currency.active) || 'USD';
    try {
      return new Intl.NumberFormat(document.documentElement.lang || undefined, {
        style: 'currency',
        currency: currency
      }).format(cents / 100);
    } catch (e) {
      return (cents / 100).toFixed(2) + ' ' + currency;
    }
  }

  function stripAndTruncate(html, maxLen) {
    if (!html) return '';
    var text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen).trim() + '…';
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function escapeAttr(str) { return escapeHtml(str); }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();