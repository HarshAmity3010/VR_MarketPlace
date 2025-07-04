
import { useEffect, useState } from 'react';
import { AuthClient } from '@dfinity/auth-client';
import { idlFactory as VR_MarketPlace_backend_idl, canisterId as VR_MarketPlace_backend_canisterId } from 'declarations/VR_MarketPlace_backend';
import { Actor, HttpAgent } from '@dfinity/agent';
import './App.css';

function App() {
  // Sorting and grid logic (filter removed)
  function sortedAssets() {
    let sorted = [...assets];
    if (sort === 'Price Low-High') {
      sorted.sort((a, b) => Number(a.price) - Number(b.price));
    } else if (sort === 'Price High-Low') {
      sorted.sort((a, b) => Number(b.price) - Number(a.price));
    } else if (sort === 'Newest') {
      sorted.reverse(); // assuming latest assets are last in list
    }
    return sorted;
  }

  // Alias for legacy code expecting filteredAndSortedAssets
  const filteredAndSortedAssets = sortedAssets;
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [principal, setPrincipal] = useState('');
  // Helper to get short principal for display
  const shortPrincipal = (p) => p && p.length > 10 ? p.slice(0, 8) + '-' + p.slice(-3) : p;
  const [assets, setAssets] = useState([]);
  const [actor, setActor] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', price: '', image: '' });
  const [imagePreview, setImagePreview] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  // Marketplace controls (filter removed)
  const [sort, setSort] = useState('Newest');
  const [gridView, setGridView] = useState(true);

  // Auth
  useEffect(() => {
    // On mount, check auth and set up actor
    AuthClient.create().then(async (client) => {
      const auth = await client.isAuthenticated();
      setIsAuthenticated(auth);
      let identity = undefined;
      if (auth) {
        identity = client.getIdentity();
        const p = identity.getPrincipal();
        setPrincipal(p.toText());
      }
      // Always create actor with current identity (anonymous or II)
      const agent = new HttpAgent({ identity });
      // For local dev only
      if (import.meta.env.VITE_DFX_NETWORK === 'local') {
        await agent.fetchRootKey();
      }
      const backendActor = Actor.createActor(VR_MarketPlace_backend_idl, {
        agent,
        canisterId: VR_MarketPlace_backend_canisterId,
      });
      setActor(backendActor);
    });
  }, []);

  const login = async () => {
    const client = await AuthClient.create();
    const canisterId = import.meta.env.VITE_INTERNET_IDENTITY_CANISTER_ID || 'rdmx6-jaaaa-aaaaa-aaadq-cai';
    const network = import.meta.env.VITE_DFX_NETWORK || 'local';
    await client.login({
      identityProvider: network === 'ic'
        ? 'https://identity.ic0.app/#authorize'
        : `http://${canisterId}.localhost:4943/`,
      onSuccess: async () => {
        setIsAuthenticated(true);
        const identity = client.getIdentity();
        const principal = identity.getPrincipal();
        setPrincipal(principal.toText());
        // Create authenticated actor
        const agent = new HttpAgent({ identity });
        if (network === 'local') {
          await agent.fetchRootKey();
        }
        const backendActor = Actor.createActor(VR_MarketPlace_backend_idl, {
          agent,
          canisterId: VR_MarketPlace_backend_canisterId,
        });
        setActor(backendActor);
      },
    });
  };

  const logout = async () => {
    const client = await AuthClient.create();
    await client.logout();
    setIsAuthenticated(false);
    setPrincipal('');
    // Reset actor to anonymous
    const agent = new HttpAgent();
    if (import.meta.env.VITE_DFX_NETWORK === 'local') {
      await agent.fetchRootKey();
    }
    const backendActor = Actor.createActor(VR_MarketPlace_backend_idl, {
      agent,
      canisterId: VR_MarketPlace_backend_canisterId,
    });
    setActor(backendActor);
  };

  // Asset functions
  const fetchAssets = async () => {
    if (!actor) return;
    setLoading(true);
    try {
      const result = await actor.list_assets();
      setAssets(result);
    } catch (e) {
      setError('Failed to fetch assets.');
    }
    setLoading(false);
  };


  const handleInput = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleImage = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setForm((f) => ({ ...f, image: reader.result }));
      setImagePreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      if (!actor) throw new Error('Not ready');
      // Send price in rupees directly
      const priceRupees = Number(form.price);
      await actor.create_asset(form.name, form.description, priceRupees, form.image || '');
      setSuccess('Asset created!');
      setForm({ name: '', description: '', price: '', image: '' });
      setImagePreview('');
      fetchAssets();
    } catch (e) {
      setError('Failed to create asset.');
    }
    setLoading(false);
  };

  const handleBuy = async (id) => {
    setError('');
    setSuccess('');
    if (!isAuthenticated) {
      setError('You must be logged in to buy assets.');
      return;
    }
    setLoading(true);
    try {
      if (!actor) throw new Error('Not ready');
      const res = await actor.buy_asset(id);
      if ('Ok' in res) {
        setSuccess('Asset purchased!');
        fetchAssets();
      } else {
        setError(res.Err);
      }
    } catch (e) {
      setError('Failed to buy asset.');
    }
    setLoading(false);
  };

  const handleDelete = async (id) => {
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      if (!actor) throw new Error('Not ready');
      const res = await actor.delete_asset(id);
      if ('Ok' in res) {
        setSuccess('Asset deleted!');
        fetchAssets();
      } else {
        setError(res.Err);
      }
    } catch (e) {
      setError('Failed to delete asset.');
    }
    setLoading(false);
  };

  const handleListForSale = async (id) => {
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      if (!actor) throw new Error('Not ready');
      const priceRupees = prompt('Enter new price in rupees:');
      if (!priceRupees) return;
      const priceICP = Math.round(Number(priceRupees) / 500);
      const res = await actor.list_for_sale(id, priceICP);
      if ('Ok' in res) {
        setSuccess('Asset listed for sale!');
        fetchAssets();
      } else {
        setError(res.Err);
      }
    } catch (e) {
      setError('Failed to list asset for sale.');
    }
    setLoading(false);
  };

  // Fetch assets whenever actor changes (e.g., after login/logout)
  useEffect(() => {
    if (actor) fetchAssets();
    // eslint-disable-next-line
  }, [actor]);

  return (
    <div className="container">
      <header className="header-pro sleek-header">
        <div className="header-left">
          <h1 className="main-title">ICP VR <span className="highlight">Marketplace</span></h1>
        </div>
        <div className="header-right">
          {isAuthenticated ? (
            <div className="user-menu">
              <span className="user-avatar">{shortPrincipal(principal).slice(0, 2).toUpperCase()}</span>
              <span className="user-id">{shortPrincipal(principal)}</span>
              <button className="logout-btn-merged" onClick={logout}>Logout</button>
            </div>
          ) : (
            <button className="auth-btn" onClick={login}>Login</button>
          )}
        </div>
      </header>
      <main className="main-sleek">
        <div className="sleek-layout no-sidebar">
          <section className="sleek-content full-width">
            {error && <div className="error">{error}</div>}
            {success && <div className="success">{success}</div>}
            <div className="sleek-create-card">
              <h2 className="section-title">Create VR Asset</h2>
              <form className="asset-form-sleek" onSubmit={handleCreate} autoComplete="off">
                <div className="form-row-sleek">
                  <div className="form-group-sleek">
                    <label htmlFor="name">Asset Name</label>
                    <input id="name" name="name" placeholder="Enter asset name" value={form.name} onChange={handleInput} required />
                  </div>
                  <div className="form-group-sleek">
                    <label htmlFor="description">Description</label>
                    <input id="description" name="description" placeholder="Enter description" value={form.description} onChange={handleInput} required />
                  </div>
                  <div className="form-group-sleek">
                    <label htmlFor="price">Price (₹ Rupees)</label>
                    <input id="price" name="price" type="number" min="0" step="1" placeholder="Enter price in rupees" value={form.price} onChange={handleInput} required />
                  </div>
                  <div className="form-group-sleek">
                    <label htmlFor="image">Image</label>
                    <input id="image" name="image" type="file" accept="image/*" onChange={handleImage} />
                  </div>
                </div>
                {imagePreview && <img src={imagePreview} alt="Preview" className="image-preview-sleek" />}
                <button type="submit" className="create-btn-sleek" disabled={loading}>Create Asset</button>
              </form>
            </div>
            <div className="sleek-marketplace">
              <div className="marketplace-header-row">
                <h2 className="section-title">Marketplace</h2>
                <div className="marketplace-controls">
                  <select className="market-sort" value={sort} onChange={e => setSort(e.target.value)}>
                    <option value="Newest">Sort: Newest</option>
                    <option value="Price Low-High">Sort: Price Low-High</option>
                    <option value="Price High-Low">Sort: Price High-Low</option>
                  </select>
                  <button className={`grid-toggle${gridView ? ' active' : ''}`} title="Grid View" onClick={() => setGridView(true)}>
                    <svg width="20" height="20" viewBox="0 0 20 20"><rect x="2" y="2" width="6" height="6" rx="2" fill="#00b4d8" /><rect x="12" y="2" width="6" height="6" rx="2" fill="#00b4d8" /><rect x="2" y="12" width="6" height="6" rx="2" fill="#00b4d8" /><rect x="12" y="12" width="6" height="6" rx="2" fill="#00b4d8" /></svg>
                  </button>
                  <button className={`grid-toggle${!gridView ? ' active' : ''}`} title="List View" onClick={() => setGridView(false)}>
                    <svg width="20" height="20" viewBox="0 0 20 20"><rect x="2" y="3" width="16" height="3" rx="1.5" fill="#00b4d8" /><rect x="2" y="8.5" width="16" height="3" rx="1.5" fill="#00b4d8" /><rect x="2" y="14" width="16" height="3" rx="1.5" fill="#00b4d8" /></svg>
                  </button>
                </div>
              </div>
              {loading ? <div>Loading...</div> : (
                gridView ? (
                  <div className="sleek-asset-grid">
                    {sortedAssets().length === 0 && <div className="no-assets">No assets found.</div>}
                    {sortedAssets().map(asset => {
                      const assetOwner = asset.owner?.toString?.() ?? asset.owner;
                      const assetCreator = asset.creator?.toString?.() ?? asset.creator;
                      const isOwner = assetOwner === principal;
                      const priceRs = (asset.price !== undefined && asset.price !== null)
                        ? Number(asset.price).toLocaleString('en-IN')
                        : '-';
                      return (
                        <div className="asset-card" key={asset.id}>
                          <div className="asset-image-row">
                            {asset.image && asset.image.startsWith('data:image') ? (
                              <img src={asset.image} alt="VR Asset" className="asset-card-img" />
                            ) : (
                              <div className="asset-card-img asset-card-img-placeholder">No Image</div>
                            )}
                          </div>
                          <div className="asset-card-body">
                            <div className="asset-card-title">{asset.name}</div>
                            <div className="asset-card-desc">{asset.description}</div>
                            <div className="asset-card-meta">
                              <span className="asset-meta-label">Creator:</span> <span className="asset-meta-value">{shortPrincipal(assetCreator)}</span>
                            </div>
                            <div className="asset-card-meta">
                              <span className="asset-meta-label">Owner:</span> <span className="asset-meta-value">{shortPrincipal(assetOwner)}</span>
                            </div>
                            <div className="asset-card-meta">
                              <span className="asset-meta-label">Price:</span> <span className="asset-meta-value">₹{priceRs}</span>
                            </div>
                            <div className="asset-card-meta">
                              <span className="asset-meta-label">Status:</span> <span className={asset.for_sale ? 'for-sale' : 'not-for-sale'}>{asset.for_sale ? 'For Sale' : 'Not for Sale'}</span>
                            </div>
                          </div>
                          <div className="asset-card-actions">
                            {asset.for_sale && !isOwner ? (
                              <button className="buy-btn-sleek" onClick={() => handleBuy(asset.id)} disabled={loading}>Buy</button>
                            ) : isOwner ? (
                              <>
                                <button className="list-btn-sleek" onClick={() => handleListForSale(asset.id)} disabled={loading}>List for Sale</button>
                                <button className="delete-btn-sleek" onClick={() => handleDelete(asset.id)} disabled={loading}>Delete</button>
                              </>
                            ) : (
                              <span className="no-action">-</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="sleek-asset-list">
                    {filteredAndSortedAssets().length === 0 && <div className="no-assets">No assets found.</div>}
                    {filteredAndSortedAssets().map(asset => {
                      const assetOwner = asset.owner?.toString?.() ?? asset.owner;
                      const assetCreator = asset.creator?.toString?.() ?? asset.creator;
                      const isOwner = assetOwner === principal;
                      const priceRs = (asset.price !== undefined && asset.price !== null)
                        ? Number(asset.price).toLocaleString('en-IN')
                        : '-';
                      return (
                        <div className="asset-list-row" key={asset.id}>
                          <div className="asset-list-img">
                            {asset.image && asset.image.startsWith('data:image') ? (
                              <img src={asset.image} alt="VR Asset" className="asset-card-img" />
                            ) : (
                              <div className="asset-card-img asset-card-img-placeholder">No Image</div>
                            )}
                          </div>
                          <div className="asset-list-info">
                            <div className="asset-card-title">{asset.name}</div>
                            <div className="asset-card-desc">{asset.description}</div>
                            <div className="asset-card-meta">
                              <span className="asset-meta-label">Creator:</span> <span className="asset-meta-value">{shortPrincipal(assetCreator)}</span>
                            </div>
                            <div className="asset-card-meta">
                              <span className="asset-meta-label">Owner:</span> <span className="asset-meta-value">{shortPrincipal(assetOwner)}</span>
                            </div>
                            <div className="asset-card-meta">
                              <span className="asset-meta-label">Price:</span> <span className="asset-meta-value">₹{priceRs}</span>
                            </div>
                            <div className="asset-card-meta">
                              <span className="asset-meta-label">Status:</span> <span className={asset.for_sale ? 'for-sale' : 'not-for-sale'}>{asset.for_sale ? 'For Sale' : 'Not for Sale'}</span>
                            </div>
                          </div>
                          <div className="asset-card-actions">
                            {asset.for_sale && !isOwner ? (
                              <button className="buy-btn-sleek" onClick={() => handleBuy(asset.id)} disabled={loading}>Buy</button>
                            ) : isOwner ? (
                              <>
                                <button className="list-btn-sleek" onClick={() => handleListForSale(asset.id)} disabled={loading}>List for Sale</button>
                                <button className="delete-btn-sleek" onClick={() => handleDelete(asset.id)} disabled={loading}>Delete</button>
                              </>
                            ) : (
                              <span className="no-action">-</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

export default App;
