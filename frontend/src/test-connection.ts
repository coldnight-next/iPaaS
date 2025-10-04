import { supabase, auth, db } from './lib/supabase';

// Test Supabase connection
export async function testConnection() {
  console.log('🔍 Testing Supabase connection...');
  
  try {
    // Test 1: Check if we can connect
    const { data: session, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      console.error('❌ Session error:', sessionError);
    } else {
      console.log('✅ Session check passed:', session ? 'Logged in' : 'Not logged in');
    }

    // Test 2: Try to fetch sync logs (public data)
    const { data: syncConfigs, error: configError } = await supabase
      .from('sync_configurations')
      .select('*')
      .limit(5);
    
    if (configError) {
      console.error('❌ Database query error:', configError);
    } else {
      console.log('✅ Database connection successful!');
      console.log(`📊 Found ${syncConfigs?.length || 0} sync configurations`);
    }

    // Test 3: Check default field mapping templates
    const { data: templates, error: templateError } = await supabase
      .from('field_mapping_templates')
      .select('*')
      .eq('is_default', true);
    
    if (templateError) {
      console.error('❌ Template query error:', templateError);
    } else {
      console.log('✅ Found default field mapping templates:', templates?.length || 0);
    }

    console.log('\n🎉 Connection test completed!');
    return { success: true };
  } catch (error) {
    console.error('❌ Unexpected error:', error);
    return { success: false, error };
  }
}

// Run test if this file is executed directly
if (import.meta.url === new URL(import.meta.url).href) {
  testConnection();
}
