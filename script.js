import { supabase } from './supabaseClient.js';

/* PEPE KUN - Dynamic Storefront, Auth & Inquiry Script */

(function () {
  'use strict';

  // State Management
  let cart = JSON.parse(localStorage.getItem('pepe_cart') || '[]');
  let products = [];
  let categories = [];
  let currentUser = null;

  // 1. Auth Session Check & Sync Cart
  async function checkUserSession() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      currentUser = user;

      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .single();

        const displayName = profile?.full_name || user.email?.split('@')[0] || 'Account';

        const loginBtn = document.getElementById('auth-login-btn');
        if (loginBtn) {
          loginBtn.textContent = displayName;
          loginBtn.href = 'account.html';
        }

        const mobileLoginBtn = document.getElementById('mobile-auth-btn');
        if (mobileLoginBtn) {
          mobileLoginBtn.textContent = displayName;
          mobileLoginBtn.href = 'account.html';
        }

        // Sync initial cart from Supabase for logged-in user
        await fetchUserCartFromSupabase();
      } else {
        updateCartUI();
      }
    } catch (err) {
      console.error('Error checking user session:', err);
      updateCartUI();
    }
  }

  // Fetch cart count & items from Supabase
  async function fetchUserCartFromSupabase() {
    if (!currentUser) return;

    try {
      const { data, error } = await supabase
        .from('cart')
        .select('*, products(*)')
        .eq('user_id', currentUser.id);

      if (error) throw error;

      if (data) {
        cart = data.map(item => ({
          ...item.products,
          quantity: item.quantity,
          cart_id: item.id
        }));
        updateCartUI();
      }
    } catch (err) {
      console.error('Error fetching Supabase cart:', err);
    }
  }

  // 2. Cart Functions
  function updateCartUI() {
    const count = cart.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);
    ['cart-count', 'cart-count-mobile'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = count;
    });
    localStorage.setItem('pepe_cart', JSON.stringify(cart));
  }

  async function addToCart(productId, sourceBtnId = null) {
    const product = products.find(p => String(p.id) === String(productId));
    if (!product && !currentUser) return;

    const targetBtnId = sourceBtnId || `btn-${productId}`;
    const btn = document.getElementById(targetBtnId);
    let originalText = '';
    if (btn) {
      originalText = btn.textContent;
      btn.textContent = 'Adding...';
      btn.disabled = true;
    }

    try {
      if (currentUser) {
        // Logged-in User: Sync directly with Supabase
        const { data: existingItem, error: fetchErr } = await supabase
          .from('cart')
          .select('id, quantity')
          .eq('user_id', currentUser.id)
          .eq('product_id', productId)
          .maybeSingle();

        if (fetchErr) throw fetchErr;

        if (existingItem) {
          const newQty = (Number(existingItem.quantity) || 1) + 1;
          const { error: updateErr } = await supabase
            .from('cart')
            .update({ quantity: newQty, updated_at: new Date().toISOString() })
            .eq('id', existingItem.id);

          if (updateErr) throw updateErr;
        } else {
          const { error: insertErr } = await supabase
            .from('cart')
            .insert([{
              user_id: currentUser.id,
              product_id: productId,
              quantity: 1
            }]);

          if (insertErr) throw insertErr;
        }

        await fetchUserCartFromSupabase();
      } else {
        // Guest User: LocalStorage Fallback
        const existingIndex = cart.findIndex(p => String(p.id) === String(productId));
        if (existingIndex > -1) {
          cart[existingIndex].quantity = (Number(cart[existingIndex].quantity) || 1) + 1;
        } else if (product) {
          cart.push({ ...product, quantity: 1 });
        }
        updateCartUI();
      }

      if (btn) {
        btn.textContent = 'Added ✓';
        setTimeout(() => {
          btn.textContent = originalText;
          btn.disabled = false;
        }, 1200);
      }
    } catch (err) {
      console.error('Error adding item to cart:', err);
      if (btn) {
        btn.textContent = originalText;
        btn.disabled = false;
      }
    }
  }

  // 3. Category Functions
  async function loadCategories() {
    const categoryGrid = document.getElementById('category-grid');
    if (!categoryGrid) return;

    const { data, error } = await supabase
      .from('categories')
      .select('id, name, image_url');

    if (error) {
      console.error('Error loading categories:', error);
      return;
    }

    categories = data || [];

    categoryGrid.innerHTML = categories.map(cat => `
      <div onclick="showCategoryProducts('${cat.id}', '${cat.name.replace(/'/g, "\\'")}')" 
           class="group cursor-pointer bg-white rounded-3xl p-6 shadow-sm border border-white/60 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 text-center">
        <div class="w-full aspect-square rounded-2xl overflow-hidden bg-gray-50 mb-4 border border-gray-100">
          <img src="${cat.image_url}" alt="${cat.name}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
        </div>
        <h3 class="text-xl font-semibold text-gray-900 group-hover:text-pink-500 transition-colors">${cat.name}</h3>
      </div>
    `).join('');
  }

  // 4. Product Functions
  async function showCategoryProducts(categoryId, categoryName) {
    const categoriesSection = document.getElementById('categories');
    const productSection = document.getElementById('product-display');
    const productGrid = document.getElementById('product-grid');
    const categoryTitle = document.getElementById('current-category-title');

    if (categoryTitle) categoryTitle.textContent = categoryName;

    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('category_id', categoryId);

    if (error) {
      console.error('Error loading products:', error);
      return;
    }

    products = data || [];

    if (productGrid) {
      if (products.length === 0) {
        productGrid.innerHTML = `<p class="col-span-full text-center text-gray-500 py-8">No products found in this category.</p>`;
      } else {
        productGrid.innerHTML = products.map(prod => {
          const imagesArr = Array.isArray(prod.images) ? prod.images : JSON.parse(prod.images || '[]');
          const mainImg = imagesArr[0] || 'https://via.placeholder.com/300';

          return `
            <div class="bg-white rounded-3xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-all duration-300 flex flex-col justify-between">
              <div class="cursor-pointer" onclick="openProductModal('${prod.id}')">
                <div class="w-full aspect-square rounded-2xl overflow-hidden bg-gray-50 mb-3 border border-gray-100">
                  <img src="${mainImg}" alt="${prod.title}" class="w-full h-full object-cover hover:scale-105 transition-transform duration-300">
                </div>
                <h4 class="font-semibold text-gray-900 text-base mb-1 line-clamp-1">${prod.title}</h4>
                <p class="text-pink-500 font-bold text-lg mb-3">$${parseFloat(prod.price).toFixed(2)}</p>
              </div>
              <button id="btn-${prod.id}" onclick="addToCart('${prod.id}', 'btn-${prod.id}')" 
                      class="w-full bg-brand-900 text-white text-xs font-medium py-2.5 rounded-full hover:bg-pink-500 transition-colors">
                Add to Cart
              </button>
            </div>
          `;
        }).join('');
      }
    }

    if (categoriesSection && productSection) {
      categoriesSection.classList.add('hidden');
      productSection.classList.remove('hidden');
      setTimeout(() => {
        productSection.classList.remove('opacity-0');
      }, 10);
    }
  }

  function hideProducts() {
    const section = document.getElementById('product-display');
    if (!section) return;

    section.classList.add('opacity-0');

    setTimeout(() => {
      section.classList.add('hidden');
      document.getElementById('categories').classList.remove('hidden');
      document.getElementById('categories').scrollIntoView({ behavior: 'smooth' });
    }, 300);
  }

  // 5. Quick-View Modal Functions
  function openProductModal(productId) {
    const prod = products.find(p => String(p.id) === String(productId));
    if (!prod) return;

    const modal = document.getElementById('product-modal');
    const mainImg = document.getElementById('modal-main-img');
    const title = document.getElementById('modal-title');
    const price = document.getElementById('modal-price');
    const desc = document.getElementById('tab-desc');
    const specsList = document.getElementById('modal-specs-list');
    const thumbsContainer = document.getElementById('modal-thumbnails');
    const addCartBtn = document.getElementById('modal-add-cart-btn');

    const images = Array.isArray(prod.images) ? prod.images : JSON.parse(prod.images || '[]');
    const specs = Array.isArray(prod.specifications) ? prod.specifications : JSON.parse(prod.specifications || '[]');

    if (mainImg) mainImg.src = images[0] || '';
    if (title) title.textContent = prod.title;
    if (price) price.textContent = `$${parseFloat(prod.price).toFixed(2)}`;
    if (desc) desc.textContent = prod.description || 'No description available.';

    if (specsList) {
      specsList.innerHTML = specs.length > 0
        ? specs.map(s => `<li>${s}</li>`).join('')
        : '<li>No specifications listed.</li>';
    }

    if (thumbsContainer) {
      thumbsContainer.innerHTML = images.map(img => `
        <img src="${img}" onclick="document.getElementById('modal-main-img').src='${img}'" 
             class="w-full aspect-square object-cover rounded-xl border border-gray-200 cursor-pointer hover:border-pink-500 transition-all">
      `).join('');
    }

    if (addCartBtn) {
      addCartBtn.onclick = () => addToCart(prod.id, 'modal-add-cart-btn');
    }

    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
      setTimeout(() => modal.classList.remove('opacity-0'), 10);
      document.body.style.overflow = 'hidden';
    }
  }

  function closeModal() {
    const modal = document.getElementById('product-modal');
    if (!modal) return;
    modal.classList.add('opacity-0');
    setTimeout(() => {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
      document.body.style.overflow = 'auto';
    }, 300);
  }

  // 6. Contact Form Inquiry Submission
  async function handleContactSubmit(event) {
    event.preventDefault();

    const nameInput = document.getElementById('contact-name');
    const emailInput = document.getElementById('contact-email');
    const messageInput = document.getElementById('contact-message');
    const submitBtn = document.getElementById('contact-submit-btn');

    if (!nameInput || !emailInput || !messageInput) return;

    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    const message = messageInput.value.trim();

    if (!name || !email || !message) {
      alert('Please fill in all fields.');
      return;
    }

    const originalBtnText = submitBtn ? submitBtn.textContent : 'Send Message';
    if (submitBtn) {
      submitBtn.textContent = 'Sending...';
      submitBtn.disabled = true;
    }

    try {
      const { error } = await supabase
        .from('inquiries')
        .insert([{ name, email, message }]);

      if (error) throw error;

      alert('Thank you! Your message has been sent successfully.');
      document.getElementById('contact-form')?.reset();
    } catch (err) {
      console.error('Error submitting inquiry:', err);
      alert('Failed to send message. Please try again later.');
    } finally {
      if (submitBtn) {
        submitBtn.textContent = originalBtnText;
        submitBtn.disabled = false;
      }
    }
  }

  // Expose global handlers needed for inline onclick attributes in HTML
  window.showCategoryProducts = showCategoryProducts;
  window.hideProducts = hideProducts;
  window.openProductModal = openProductModal;
  window.closeModal = closeModal;
  window.addToCart = addToCart;

  // Initialize on page load
  document.addEventListener('DOMContentLoaded', () => {
    checkUserSession();
    loadCategories();

    const contactForm = document.getElementById('contact-form');
    if (contactForm) {
      contactForm.addEventListener('submit', handleContactSubmit);
    }
  });
})();