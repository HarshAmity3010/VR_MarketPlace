// WARNING: This is for development/testing only. Remove or protect in production!
#[ic_cdk::update]
fn delete_all_assets() -> Result<(), String> {
    let user = caller();
    // Optionally, restrict to a specific admin principal here
    ASSETS.with(|assets| {
        assets.borrow_mut().clear();
    });
    NEXT_ASSET_ID.with(|id| {
        *id.borrow_mut() = 1;
    });
    Ok(())
}
#[ic_cdk::update]
fn delete_asset(asset_id: u64) -> Result<(), String> {
    let user = caller();
    ASSETS.with(|assets| {
        let mut assets = assets.borrow_mut();
        if let Some(asset) = assets.get(&asset_id) {
            if asset.owner != user {
                return Err("Only the owner can delete the asset".to_string());
            }
        } else {
            return Err("Asset not found".to_string());
        }
        assets.remove(&asset_id);
        Ok(())
    })
}

use ic_cdk::api::caller;
// ...existing code...
use candid::{CandidType, Deserialize, Principal};
use std::collections::HashMap;

#[derive(Clone, Debug, CandidType, Deserialize)]
pub struct Asset {
    pub id: u64,
    pub name: String,
    pub description: String,
    pub creator: Principal,
    pub owner: Principal,
    pub price: u64, // in cycles or tokens
    pub for_sale: bool,
    pub image: String, // base64-encoded image
}

thread_local! {
    static ASSETS: std::cell::RefCell<HashMap<u64, Asset>> = std::cell::RefCell::new(HashMap::new());
    static NEXT_ASSET_ID: std::cell::RefCell<u64> = std::cell::RefCell::new(1);
}

#[ic_cdk::query]
fn greet(name: String) -> String {
    format!("Hello, {}! Welcome to the ICP VR Marketplace!", name)
}

#[ic_cdk::update]
fn create_asset(name: String, description: String, price: u64, image: String) -> Asset {
    let creator = caller();
    let asset = ASSETS.with(|assets| {
        NEXT_ASSET_ID.with(|next_id| {
            let mut assets = assets.borrow_mut();
            let mut id = next_id.borrow_mut();
            let asset = Asset {
                id: *id,
                name: name.clone(),
                description: description.clone(),
                creator,
                owner: creator,
                price,
                for_sale: true,
                image: image.clone(),
            };
            assets.insert(*id, asset.clone());
            *id += 1;
            asset
        })
    });
    asset
}

#[ic_cdk::query]
fn list_assets() -> Vec<Asset> {
    ASSETS.with(|assets| assets.borrow().values().cloned().collect())
}

#[ic_cdk::update]
fn buy_asset(asset_id: u64) -> Result<Asset, String> {
    let buyer = caller();
    ASSETS.with(|assets| {
        let mut assets = assets.borrow_mut();
        if let Some(asset) = assets.get_mut(&asset_id) {
            if !asset.for_sale {
                return Err("Asset is not for sale".to_string());
            }
            if asset.owner == buyer {
                return Err("You already own this asset".to_string());
            }
            // Payment logic would go here (omitted for simplicity)
            asset.owner = buyer;
            asset.for_sale = false;
            Ok(asset.clone())
        } else {
            Err("Asset not found".to_string())
        }
    })
}

#[ic_cdk::update]
fn list_for_sale(asset_id: u64, price: u64) -> Result<Asset, String> {
    let user = caller();
    ASSETS.with(|assets| {
        let mut assets = assets.borrow_mut();
        if let Some(asset) = assets.get_mut(&asset_id) {
            if asset.owner != user {
                return Err("Only the owner can list the asset for sale".to_string());
            }
            asset.for_sale = true;
            asset.price = price;
            Ok(asset.clone())
        } else {
            Err("Asset not found".to_string())
        }
    })
}
