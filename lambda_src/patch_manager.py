
def apply_patches(original_text, patches):
    """
    Applies a list of search/replace patches to the original text.
    
    Args:
        original_text (str): The original file content.
        patches (list): List of dicts with 'search' and 'replace' keys.
        
    Returns:
        tuple: (updated_text, success_bool, error_message)
    """
    updated_text = original_text
    
    for i, patch in enumerate(patches):
        search_block = patch.get('search')
        replace_block = patch.get('replace')
        
        if not search_block:
            return original_text, False, f"Patch {i} missing 'search' block."
        
        # Normalize line endings for comparison ?? Optional, but good for robustness
        # For now, strict matching
        
        count = updated_text.count(search_block)
        
        if count == 0:
            # Try to be a bit more flexible?
            # normalize newlines
            norm_text = updated_text.replace('\r\n', '\n')
            norm_search = search_block.replace('\r\n', '\n')
            if norm_text.count(norm_search) == 1:
                updated_text = norm_text.replace(norm_search, replace_block)
                continue
            
            return original_text, False, f"Patch {i}: Search block not found in text."
            
        if count > 1:
            return original_text, False, f"Patch {i}: Search block found {count} times. Ambiguous."
            
        updated_text = updated_text.replace(search_block, replace_block)
        
    return updated_text, True, "Success"
